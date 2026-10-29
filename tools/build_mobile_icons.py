"""Generate installation assets from the existing institutional mark."""
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
source=Image.open(root/'public/logo.png').convert('RGBA')
out=root/'public/app-icons';out.mkdir(exist_ok=True)
for size,name in [(192,'icon-192.png'),(512,'icon-512.png'),(180,'apple-touch-icon.png')]:
 canvas=Image.new('RGB',(size,size),'#09090b')
 mark=source.resize((size,size),Image.Resampling.LANCZOS)
 canvas.paste(mark,(0,0),mark);canvas.save(out/name,optimize=True)
# Keep the full circular mark within the maskable icon's central safe area.
canvas=Image.new('RGB',(512,512),'#09090b')
mark=source.resize((360,360),Image.Resampling.LANCZOS)
canvas.paste(mark,(76,76),mark);canvas.save(out/'icon-maskable-512.png',optimize=True)
