import urllib.request,hashlib
from pathlib import Path
url='https://raw.githubusercontent.com/opencv/opencv/4.13.0/samples/data/lena.jpg'
data=urllib.request.urlopen(url,timeout=30).read(2_000_000)
if hashlib.sha256(data).hexdigest()!='7de7ed51a1594fff247f4cae2301eceacf5313d6011e37b4a4c8733f7bb72c07':raise RuntimeError('Fixture hash mismatch')
path=Path(__file__).parent/'fixtures';path.mkdir(exist_ok=True)
(path/'lena.jpg').write_bytes(data)
print('Fixture técnico oficial verificado; não representa uma criança real do aplicativo.')
