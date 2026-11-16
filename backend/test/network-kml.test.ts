import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';
import { classifyName, parseKml, projectCodeFrom, readNetworkFile, simplifyLine, splitProjectCode, toBatches } from '../../frontend/src/lib/network-kml.ts';

const ZW = '​';

function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (const b of buf) {
    let c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const toAb = (b: Buffer): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer;

function makeZip(entries: { name: string; data: Buffer; deflate?: boolean }[]): ArrayBuffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name);
    const body = e.deflate ? deflateRawSync(e.data) : e.data;
    const method = e.deflate ? 8 : 0;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(crc32(e.data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc32(e.data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, body);
    centrals.push(central, nameBuf);
    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return toAb(Buffer.concat([...locals, cd, eocd]));
}

test('classifyName', () => {
  assert.equal(classifyName('CTO-GR1-0249'), 'cto');
  assert.equal(classifyName('CTOI-GR1-0027'), 'cto');
  assert.equal(classifyName('MCTOI-GR1-0003'), 'cto');
  assert.equal(classifyName(`${ZW}CTI-ITA01`), 'cto');
  assert.equal(classifyName('TT2-FH02-CEOSP-SP02.1'), 'ceo');
  assert.equal(classifyName('CES-ITA-0001'), 'ceo');
  assert.equal(classifyName('POP Guarulhos 1'), 'pop');
  assert.equal(classifyName('CX12_R3'), 'outro');
});

test('projectCodeFrom', () => {
  const desc = ' CMEXKEY : VIPT|20210625|cmprod|3|42917 CMDISPLAYTEXT : GRS01-FH01-P46-L04-R02-C13 CMCLASSID : 3 CMOBJECTID : 42917 ';
  assert.equal(projectCodeFrom('CTO-GR1-0249', desc), 'GRS01-FH01-P46-L04-R02-C13');
  assert.equal(projectCodeFrom('CTO-X', 'CMDISPLAYTEXT:GRS01-FH01-P46 CMCLASSID : 3'), 'GRS01-FH01-P46');
  assert.equal(projectCodeFrom('CTO-X', '<![CDATA[<b>CMDISPLAYTEXT : A1-FH02-P1</b> CMCLASSID : 3]]>'), 'A1-FH02-P1');
  assert.equal(projectCodeFrom(`CTOI-GR1-0052${ZW}GR1-FH05-P53-LR5.5-R06-C01`, ' CMDISPLAYTEXT: CMCLASSID : 3 '), 'GR1-FH05-P53-LR5.5-R06-C01');
  assert.equal(projectCodeFrom('CX12_R3', ''), null);
});

test('splitProjectCode', () => {
  assert.deepEqual(splitProjectCode('GRS01-FH01-P46-L04-R02-C13'), { pop: 'GRS01', fh: 'FH01' });
  assert.deepEqual(splitProjectCode(null), { pop: null, fh: null });
});

test('simplifyLine drops collinear points within tolerance', () => {
  const line: [number, number][] = [
    [-46.5, -23.5], [-46.4999, -23.5000001], [-46.4998, -23.5], [-46.4997, -23.5000001], [-46.4996, -23.5],
  ];
  assert.deepEqual(simplifyLine(line), [line[0], line[4]]);
  const bend: [number, number][] = [[-46.5, -23.5], [-46.4995, -23.499], [-46.499, -23.5]];
  assert.equal(simplifyLine(bend).length, 3);
});

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<Style id="s1"><LineStyle><color>ff0000ff</color><width>2</width></LineStyle></Style>
<StyleMap id="m1"><Pair><key>normal</key><styleUrl>#s1</styleUrl></Pair><Pair><key>highlight</key><styleUrl>#s2</styleUrl></Pair></StyleMap>
<Placemark>
  <name>${ZW}CTO-GR1-0249</name>
  <description><![CDATA[ CMEXKEY : VIPT|1 CMDISPLAYTEXT : GRS01-FH01-P46-L04-R02-C13 CMCLASSID : 3 ]]></description>
  <Point><coordinates>-46.5,-23.5,0</coordinates></Point>
</Placemark>
<Placemark>
  <name>Cabo 1</name>
  <gx:drawOrder>3</gx:drawOrder>
  <styleUrl>#m1</styleUrl>
  <LineString><coordinates>-46.5,-23.5,0 -46.4,-23.4,0
  -46.3,-23.3,0</coordinates></LineString>
</Placemark>
<Placemark>
  <name>CES-ITA-0001</name>
  <MultiGeometry><Point><coordinates>-46.2,-23.2,0</coordinates></Point></MultiGeometry>
</Placemark>
</Document></kml>`;

test('parseKml', () => {
  const r = parseKml(KML);
  assert.equal(r.elements.length, 2);
  assert.equal(r.cables.length, 1);
  const cto = r.elements[0];
  assert.equal(cto.kind, 'cto');
  assert.equal(cto.name, 'CTO-GR1-0249');
  assert.equal(cto.projectCode, 'GRS01-FH01-P46-L04-R02-C13');
  assert.equal(cto.pop, 'GRS01');
  assert.equal(cto.fh, 'FH01');
  assert.equal(cto.lat, -23.5);
  assert.equal(cto.lng, -46.5);
  assert.equal(r.elements[1].kind, 'ceo');
  assert.equal(r.cables[0].color, '#ff0000');
  assert.deepEqual(r.cables[0].points, [[-46.5, -23.5], [-46.3, -23.3]]); // ponto do meio alinhado sai na simplificacao
  assert.equal(cto.code, 'CTO-GR1-0249');
});

test('parseKml: placemark with point and line emits both; no style gives null color', () => {
  const r = parseKml('<kml><Placemark><name>X</name><MultiGeometry><Point><coordinates>1,2,0</coordinates></Point><LineString><coordinates>1,2,0 3,4,0</coordinates></LineString></MultiGeometry></Placemark></kml>');
  assert.equal(r.elements.length, 1);
  assert.equal(r.cables.length, 1);
  assert.equal(r.cables[0].color, null);
});

test('readNetworkFile', async () => {
  assert.deepEqual(await readNetworkFile('a.kmz', new ArrayBuffer(64)), { skipped: 'arquivo vazio ou corrompido' });
  assert.deepEqual(await readNetworkFile('a.kml', new ArrayBuffer(0)), { skipped: 'arquivo vazio ou corrompido' });
  const noKml = makeZip([{ name: 'readme.txt', data: Buffer.from('oi') }]);
  assert.deepEqual(await readNetworkFile('a.kmz', noKml), { skipped: 'zip sem arquivo .kml' });
  const bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('<?xml version="1.0"?><kml/>')]);
  const r = await readNetworkFile('a.kml', toAb(bom));
  assert.ok('text' in r && r.text.startsWith('<?xml'));
  const stored = await readNetworkFile('a.kmz', makeZip([{ name: 'doc.kml', data: Buffer.from(KML) }]));
  assert.ok('text' in stored && stored.text === KML);
  const deflated = await readNetworkFile('a.kmz', makeZip([{ name: 'x.png', data: Buffer.from('p') }, { name: 'doc.kml', data: Buffer.from(KML), deflate: true }]));
  assert.ok('text' in deflated && deflated.text === KML);
});

test('toBatches', () => {
  const sizes = toBatches(Array.from({ length: 4500 }, (_, i) => i)).map((b) => b.length);
  assert.deepEqual(sizes, [2000, 2000, 500]);
  assert.deepEqual(toBatches([1, 2, 3], 2), [[1, 2], [3]]);
});

test('parseKml: double-encoded <img onerror> in a name never comes out as a tag', () => {
  const evil = '&amp;lt;img src=x onerror=alert(1)&amp;gt;CTO-01';
  const r = parseKml(`<kml><Placemark><name>${evil}</name><description>&amp;lt;b onmouseover=x&amp;gt;d&amp;lt;/b&amp;gt;</description><Point><coordinates>-46.5,-23.5,0</coordinates></Point></Placemark><Placemark><name>${evil}</name><LineString><coordinates>-46.5,-23.5,0 -46.4,-23.4,0</coordinates></LineString></Placemark></kml>`);
  const names = [...r.elements.map((e) => e.name), ...r.cables.map((c) => c.name)];
  assert.ok(names.length >= 2);
  for (const name of names) {
    assert.doesNotMatch(name, /<[a-z!/]/i);
    assert.ok(name.includes('CTO-01'));
  }
});

test('parseKml: cabos sao simplificados', () => {
  const coords = Array.from({ length: 101 }, (_, i) => `${-46.5 + i * 0.0001},${-23.5 + (i % 2) * 0.0000001},0`).join(' ');
  const r = parseKml(`<kml><Placemark><name>Reto</name><LineString><coordinates>${coords}</coordinates></LineString></Placemark></kml>`);
  assert.equal(r.cables.length, 1);
  assert.equal(r.cables[0].points.length, 2);
});

test('parseKml: cabo com mais de 5000 pontos depois de simplificar vira pedacos de ate 5000, mesmo nome e cor', () => {
  // zigue-zague de ~11 m: nenhum ponto cai na simplificacao (tolerancia 2 m)
  const total = 12001;
  const coords = Array.from({ length: total }, (_, i) => `${-46.5 + i * 0.0001},${-23.5 + (i % 2) * 0.0001},0`).join(' ');
  const r = parseKml(`<kml><Style id="s"><LineStyle><color>ff00ff00</color></LineStyle></Style><Placemark><name>Tronco</name><styleUrl>#s</styleUrl><LineString><coordinates>${coords}</coordinates></LineString></Placemark></kml>`);
  assert.ok(r.cables.length >= 3);
  for (const cable of r.cables) {
    assert.ok(cable.points.length <= 5000 && cable.points.length >= 2);
    assert.equal(cable.name, 'Tronco');
    assert.equal(cable.color, '#00ff00');
  }
  for (let i = 1; i < r.cables.length; i += 1) assert.deepEqual(r.cables[i].points[0], r.cables[i - 1].points.at(-1)); // sem buraco entre os pedacos
  const distinct = new Set(r.cables.flatMap((c) => c.points.map((p) => p.join(','))));
  assert.equal(distinct.size, total);
});

test('parseKml: code so quando o primeiro token tem digito e nao e so o tipo', () => {
  const pm = (name: string) => `<Placemark><name>${name}</name><Point><coordinates>-46.5,-23.5,0</coordinates></Point></Placemark>`;
  const r = parseKml(`<kml>${pm('CTO 12')}${pm('CTO-GR1-0249')}${pm('CEO ABC')}${pm('CEO-12 rua x')}${pm('CTOI')}</kml>`);
  assert.deepEqual(r.elements.map((e) => e.code), [null, 'CTO-GR1-0249', null, 'CEO-12', null]);
});

test('readNetworkFile ignora entradas __MACOSX/', async () => {
  const zip = makeZip([{ name: '__MACOSX/._doc.kml', data: Buffer.from('lixo do mac') }, { name: 'doc.kml', data: Buffer.from(KML) }]);
  const r = await readNetworkFile('a.kmz', zip);
  assert.ok('text' in r && r.text === KML);
  const onlyMac = makeZip([{ name: '__MACOSX/._doc.kml', data: Buffer.from('lixo') }]);
  assert.deepEqual(await readNetworkFile('a.kmz', onlyMac), { skipped: 'zip sem arquivo .kml' });
});
