"""Real-time reactive event broker (SSE & Postgres NOTIFY/LISTEN).

Provides microservice-grade real-time event streaming across all sectors of
Lagoinha Systems & Kids. Zero manual page refreshing required.
"""
import asyncio
from collections import deque
from datetime import datetime, timezone
import json
import logging
import os
import threading
import time
import uuid
from typing import Any, Dict, Optional, Set

from fastapi import APIRouter, Depends, Request
from starlette.responses import StreamingResponse
from . import store as s
from .app import session, fail

logger = logging.getLogger('lagoinha.realtime')

router = APIRouter(prefix='/api/realtime', tags=['Realtime'])


class RealtimeSubscriber:
    """Represents an active SSE client connection with an isolated asyncio queue."""
    def __init__(self, user_id: int, allowed_sectors: Set[str]):
        self.id = str(uuid.uuid4())
        self.user_id = user_id
        self.allowed_sectors = set(allowed_sectors)
        self.queue: asyncio.Queue = asyncio.Queue(maxsize=120)
        self.connected_at = time.time()
        self.last_ping = time.time()


class RealtimeBroker:
    """In-memory pub/sub broker with seamless PostgreSQL cross-instance bridge."""
    def __init__(self):
        self.subscribers: Dict[str, RealtimeSubscriber] = {}
        self.recent_event_ids: deque = deque(maxlen=2000)
        self.seen_lock = threading.Lock()
        self._loop: Optional[asyncio.AbstractEventLoop] = None
        self._listener_thread: Optional[threading.Thread] = None
        self._running = True

    def set_loop(self, loop: asyncio.AbstractEventLoop):
        self._loop = loop

    def register(self, sub: RealtimeSubscriber) -> str:
        self.subscribers[sub.id] = sub
        return sub.id

    def unregister(self, sub: RealtimeSubscriber):
        self.subscribers.pop(sub.id, None)

    def is_duplicate(self, event_id: str) -> bool:
        if not event_id:
            return False
        with self.seen_lock:
            if event_id in self.recent_event_ids:
                return True
            self.recent_event_ids.append(event_id)
            return False

    def _deliver_to_subscriber(self, sub: RealtimeSubscriber, event: dict):
        target_uid = event.get('user_id')
        if target_uid is not None and target_uid != sub.user_id:
            return
        target_sector = event.get('sector')
        if target_sector and target_sector != 'all':
            if target_sector not in sub.allowed_sectors:
                return
        try:
            sub.queue.put_nowait(event)
        except asyncio.QueueFull:
            try:
                sub.queue.get_nowait()
                sub.queue.put_nowait(event)
            except Exception:
                pass

    def dispatch_local(self, event: dict):
        """Dispatch event locally to all matching active subscribers."""
        if self.is_duplicate(event.get('id', '')):
            return
        for sub in list(self.subscribers.values()):
            self._deliver_to_subscriber(sub, event)

    def publish(
        self,
        event_type: str,
        data: dict,
        user_id: Optional[int] = None,
        sector: Optional[str] = None
    ):
        """Thread-safe event publishing from any synchronous or asynchronous route."""
        event = {
            'id': str(uuid.uuid4()),
            'type': event_type,
            'data': data,
            'user_id': user_id,
            'sector': sector,
            'timestamp': datetime.now(timezone.utc).isoformat(),
        }

        # 1. Dispatch locally on asyncio loop
        loop = self._loop
        if loop and loop.is_running():
            try:
                loop.call_soon_threadsafe(self.dispatch_local, event)
            except RuntimeError:
                pass
        else:
            self.dispatch_local(event)

        # 2. Cross-instance broadcast via PostgreSQL NOTIFY if connected
        db_url = os.getenv('KIDS_DATABASE_URL')
        if db_url:
            self._broadcast_postgres(event)

    def _broadcast_postgres(self, event: dict):
        try:
            # Reuse the application's bounded pool; notify runs after the data commit.
            with s.db() as conn:
                payload = json.dumps(event)
                if len(payload) > 7500:
                    compact = {**event, 'data': {'ref': str(event['data'].get('id', '')), 'truncated': True}}
                    payload = json.dumps(compact)
                conn.execute("SELECT pg_notify('lagoinha_realtime', ?)", (payload,))
        except Exception as err:
            logger.warning(f"Realtime Postgres notify warning: {err}")

    def start_postgres_listener(self):
        """Start listening for cross-instance broadcasts from Cloud SQL PostgreSQL."""
        if not os.getenv('KIDS_DATABASE_URL'):
            return
        if self._listener_thread and self._listener_thread.is_alive():
            return

        def _listener():
            import psycopg
            while self._running:
                try:
                    with psycopg.connect(os.environ['KIDS_DATABASE_URL'], autocommit=True) as conn:
                        with conn.cursor() as cur:
                            cur.execute("LISTEN lagoinha_realtime;")
                        for notify in conn.notifies():
                            if not self._running:
                                break
                            try:
                                event = json.loads(notify.payload)
                                loop = self._loop
                                if loop and loop.is_running():
                                    loop.call_soon_threadsafe(self.dispatch_local, event)
                                else:
                                    self.dispatch_local(event)
                            except Exception as err:
                                logger.warning(f"Realtime notify parse error: {err}")
                except Exception as err:
                    if self._running:
                        logger.warning(f"Realtime Postgres listener disconnected: {err}")
                        time.sleep(2)

        t = threading.Thread(target=_listener, daemon=True, name="RealtimePgListener")
        self._listener_thread = t
        t.start()


broker = RealtimeBroker()


def publish(event_type: str, data: dict, user_id: Optional[int] = None, sector: Optional[str] = None):
    """Global helper to publish real-time events across the platform."""
    s.after_commit(lambda: broker.publish(event_type, data, user_id=user_id, sector=sector))


def dispatch_notification_event(c, user_id: int, kind: str, title: str, message: str, sector: str = '', context_id: str = '', notification_id: Optional[int] = None):
    """Helper to publish real-time notification to a specific user and bump their badge."""
    try:
        count = c.execute('SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL', (user_id,)).fetchone()[0]
        if notification_id is None:
            n_row = c.execute('SELECT max(id) FROM notifications WHERE user_id=?', (user_id,)).fetchone()
            notification_id = n_row[0] if n_row else 0
    except Exception:
        count = 1
        notification_id = 0
    publish('notification:new', {
        'id': notification_id,
        'kind': kind,
        'title': title,
        'message': message,
        'sector': sector,
        'context_id': context_id,
        'unread_count': count,
        'created_at': s.now()
    }, user_id=user_id)


@router.post('/ticket')
def realtime_ticket(user=Depends(session)):
    expires=min(user['expires'],int(time.time())+60)
    payload={'purpose':'realtime','session':user['token'],'expires':expires}
    return {'ticket':s.CIPHER.encrypt(json.dumps(payload).encode()).decode(),'expires':expires}


def stream_access(user):
    from .platform_access import allowed,platform_admin,is_pastor
    with s.db() as c:
        current=c.execute('SELECT u.* FROM sessions ss JOIN users u ON u.id=ss.user_id WHERE ss.token=? AND ss.expires>? AND u.active=1',(user['token'],int(time.time()))).fetchone()
        if not current:
            return None
        user['privacy_admin']=bool(platform_admin(c,user['id']) or is_pastor(c,user['id']))
        sectors={mod for mod in ('members','ministries','kids','finance') if allowed(c,dict(current),mod)}
        count=c.execute('SELECT count(*) FROM notifications WHERE user_id=? AND read_at IS NULL',(user['id'],)).fetchone()[0]
        return sectors,count


@router.get('/stream')
async def realtime_stream(request: Request, once: bool = False, user=Depends(session)):
    access=await asyncio.to_thread(stream_access,user)
    if access is None:
        fail('login','Entre para continuar.',401)
    allowed_sectors,unread_count=access

    sub = RealtimeSubscriber(user['id'], allowed_sectors)
    broker.register(sub)
    try:
        broker.set_loop(asyncio.get_running_loop())
    except RuntimeError:
        pass

    initial_state = {
        'user_id': user['id'],
        'unread_count': unread_count,
        'allowed_sectors': sorted(allowed_sectors),
        'server_time': s.now(),
    }

    async def event_generator():
        try:
            yield f"event: connected\ndata: {json.dumps(initial_state)}\n\n"
            if once:
                return
            while True:
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(sub.queue.get(), timeout=15.0)
                    access=await asyncio.to_thread(stream_access,user)
                    if access is None:
                        break
                    sub.allowed_sectors=access[0]
                    target=event.get('sector')
                    if target and target!='all' and target not in sub.allowed_sectors:
                        continue
                    evt_type = event.get('type', 'message')
                    from .privacy import hide_emails
                    payload=event.get('data', {})
                    if not user.get('privacy_admin') or evt_type.startswith('hall:'):
                        payload=hide_emails(payload,'' if evt_type.startswith('hall:') else user.get('email',''))
                    evt_data = json.dumps(payload)
                    evt_id = event.get('id', '')
                    yield f"id: {evt_id}\nevent: {evt_type}\ndata: {evt_data}\n\n"
                except asyncio.TimeoutError:
                    # Keepalive comment resets proxy / Cloud Run idle timeout
                    access=await asyncio.to_thread(stream_access,user)
                    if access is None:
                        break
                    sub.allowed_sectors=access[0]
                    yield 'event: heartbeat\ndata: {}\n\n'
        finally:
            broker.unregister(sub)

    return StreamingResponse(
        event_generator(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        }
    )


@router.get('/status')
def realtime_status(user=Depends(session)):
    """Health & statistics of the real-time event broker."""
    return {
        'status': 'ok',
        'subscribers_count': len(broker.subscribers),
        'mode': 'postgres' if os.getenv('KIDS_DATABASE_URL') else 'memory',
        'timestamp': s.now(),
    }


@router.post('/ping')
def realtime_ping(data: dict = {}, user=Depends(session)):
    """Test ping that echoes an event to the authenticated user's stream."""
    publish('test:ping', {'echo': data, 'user_name': user['name']}, user_id=user['id'])
    return {'ok': True, 'delivered_to': user['id']}
