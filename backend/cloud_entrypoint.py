"""Run HTTP and the notification worker with coordinated shutdown."""
import os,signal,subprocess,sys,time
from . import store as s

def main():
    if os.getenv('K_SERVICE') and not os.getenv('KIDS_MASTER_KEY'):
        raise RuntimeError('Cloud deployment requires a persistent encryption key.')
    with s.db() as c:
        c.execute('BEGIN IMMEDIATE')
        if not c.execute('SELECT 1 FROM users LIMIT 1').fetchone():
            password=os.getenv('KIDS_BOOTSTRAP_PASSWORD','')
            if len(password)<16:raise RuntimeError('An initial administrator password is required.')
            c.execute('INSERT INTO users(name,email,password,role,created_at) VALUES(?,?,?,?,?)',('Administração Lagoinha Kids',os.environ['KIDS_BOOTSTRAP_EMAIL'],s.password_hash(password),'admin',s.now()))
    processes=[subprocess.Popen([sys.executable,'-m','uvicorn','backend.app:app','--host','0.0.0.0','--port',os.getenv('PORT','8770'),'--proxy-headers']),subprocess.Popen([sys.executable,'-m','backend.push_worker'])]
    stopping=False
    def stop(*_):
        nonlocal stopping
        stopping=True
        for process in processes:
            if process.poll() is None:process.terminate()
    signal.signal(signal.SIGTERM,stop);signal.signal(signal.SIGINT,stop)
    try:
        while not stopping and all(p.poll() is None for p in processes):time.sleep(1)
    finally:
        stop()
        for process in processes:
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill()
    return 0 if stopping else 1
if __name__=='__main__':sys.exit(main())
