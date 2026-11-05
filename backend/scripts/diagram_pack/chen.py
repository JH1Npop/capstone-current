import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import generate_afn_chen_drawio as c
import erd_source

erd_source.prepare(c)
xml = c.generate()
Path(sys.argv[1]).write_text(xml, encoding='utf-8')
print(len(xml))
