"""WhatsApp endpoints are intentionally unavailable."""
from test_app import records, client

def test_whatsapp_dispatch_removed(records):
    admin=client(1)
    for path,method in [('recipients','get'),('config','get'),('send','post'),('test','post'),('instance/connect','post'),('instance/status','get')]:
        assert getattr(admin,method)('/api/platform/whatsapp/'+path).status_code==410
