"""Generate a genuine XLSX workbook without executing user cell formulas."""
from html.parser import HTMLParser
from xml.etree.ElementTree import Element,SubElement,tostring
from zipfile import ZipFile,ZIP_DEFLATED
from io import BytesIO

class Tables(HTMLParser):
    def __init__(self):
        super().__init__();self.tables=[];self.table=None;self.row=None;self.cell=None
    def handle_starttag(self,tag,attrs):
        if tag=='table':self.table=[];self.tables.append(self.table)
        elif tag=='tr' and self.table is not None:self.row=[];self.table.append(self.row)
        elif tag in ('td','th') and self.row is not None:self.cell=[]
    def handle_data(self,data):
        if self.cell is not None:self.cell.append(data)
    def handle_endtag(self,tag):
        if tag in ('td','th') and self.cell is not None:self.row.append(''.join(self.cell));self.cell=None
        elif tag=='table':self.table=None;self.row=None

def from_html(doc):
    parser=Tables();parser.feed(doc)
    ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    rel='http://schemas.openxmlformats.org/package/2006/relationships'
    office='http://schemas.openxmlformats.org/officeDocument/2006/relationships'
    types=Element('Types',xmlns='http://schemas.openxmlformats.org/package/2006/content-types')
    SubElement(types,'Default',Extension='rels',ContentType='application/vnd.openxmlformats-package.relationships+xml')
    SubElement(types,'Default',Extension='xml',ContentType='application/xml')
    SubElement(types,'Override',PartName='/xl/workbook.xml',ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml')
    wb=Element('workbook',xmlns=ns);sheets=SubElement(wb,'sheets');relationships=Element('Relationships',xmlns=rel)
    root_rel=Element('Relationships',xmlns=rel)
    SubElement(root_rel,'Relationship',Id='rId1',Type=office+'/officeDocument',Target='xl/workbook.xml')
    out=BytesIO()
    with ZipFile(out,'w',ZIP_DEFLATED) as z:
        for i,rows in enumerate(parser.tables,1):
            SubElement(sheets,'sheet',name=f'Relatório {i}',sheetId=str(i),attrib={'{'+office+'}id':f'rId{i}'})
            SubElement(relationships,'Relationship',Id=f'rId{i}',Type=office+'/worksheet',Target=f'worksheets/sheet{i}.xml')
            SubElement(types,'Override',PartName=f'/xl/worksheets/sheet{i}.xml',ContentType='application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml')
            sheet=Element('worksheet',xmlns=ns);data=SubElement(sheet,'sheetData')
            for row in rows:
                node=SubElement(data,'row')
                for value in row:
                    cell=SubElement(node,'c',t='inlineStr');text=SubElement(SubElement(cell,'is'),'t')
                    text.text=''.join(ch for ch in value if ord(ch)>=32 or ch in '\n\t\r')
            z.writestr(f'xl/worksheets/sheet{i}.xml',tostring(sheet,encoding='utf-8',xml_declaration=True))
        for path,node in [('[Content_Types].xml',types),('_rels/.rels',root_rel),('xl/workbook.xml',wb),('xl/_rels/workbook.xml.rels',relationships)]:
            z.writestr(path,tostring(node,encoding='utf-8',xml_declaration=True))
    return out.getvalue()
