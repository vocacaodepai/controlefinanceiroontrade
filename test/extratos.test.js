import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
delete process.env.ANTHROPIC_API_KEY;
const { seed } = await import('../src/seed.js');
const { iniciar, query, one } = await import('../src/db.js');
const S = await import('../src/services.js');
const X = await import('../src/extratos.js');

await iniciar(seed);
const id = async (t, n) => (await one(`SELECT id FROM ${t} WHERE nome = $1`, [n])).id;
const safra = await id('contas', 'Banco Safra');
const b64 = (s) => Buffer.from(s, 'latin1').toString('base64');

const OFX = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKTRANLIST>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260310120000[-3:BRT]<TRNAMT>1500.50<FITID>1<MEMO>PIX RECEBIDO CLIENTE ALFA LTDA</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260311120000[-3:BRT]<TRNAMT>-15.00<FITID>2<MEMO>PAPELARIA CENTRAL 0042</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260311120000[-3:BRT]<TRNAMT>-15.00<FITID>3<MEMO>PAPELARIA CENTRAL 0042</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;

test('números e datas brasileiros', () => {
  assert.equal(X.numeroBR('1.234,56'), 123456);
  assert.equal(X.numeroBR('-R$ 15,00'), -1500);
  assert.equal(X.numeroBR('(200,10)'), -20010);
  assert.equal(X.numeroBR('1234.56'), 123456);
  assert.equal(X.dataBR('05/03/2026'), '2026-03-05');
  assert.equal(X.dataBR('2026-03-05'), '2026-03-05');
  assert.equal(X.dataBR('31/02/2026'), null);
  assert.equal(X.termoDe('PAPELARIA CENTRAL 0042 12/03'), 'papelaria central');
});

test('OFX: lê, não usa IA, mantém linhas idênticas e evita duplicar no reenvio', async () => {
  const r = await X.importarExtrato({ conta_id: safra, nome: 'safra.ofx', base64: b64(OFX), usuario: 'Elisa' });
  assert.equal(r.formato, 'ofx');
  assert.equal(r.novos, 3, 'duas compras iguais no mesmo dia são lançamentos distintos');
  const d = await X.detalheExtrato(r.id);
  assert.equal(d.movimentos[0].tipo, 'entrada');
  assert.equal(d.movimentos[0].valor, 150050);
  assert.ok(d.movimentos.every((m) => m.status === 'pendente' && !m.categoria_id), 'sem IA e sem regra: nada é categorizado sozinho');
  const de_novo = await X.importarExtrato({ conta_id: safra, nome: 'safra.ofx', base64: b64(OFX), usuario: 'Elisa' });
  assert.equal(de_novo.novos, 0);
  assert.equal(de_novo.duplicados, 3);
  await X.excluirExtrato(de_novo.id);
});

test('lançar: exige categoria, cria nas datas do extrato, respeita dia fechado e aprende a regra', async () => {
  const ext = (await X.listarExtratos())[0];
  const d = await X.detalheExtrato(ext.id);
  const [entrada, compra1, compra2] = d.movimentos;
  const catRec = await id('categorias', 'Recebimento de cliente'), catPap = await id('categorias', 'Papelaria');

  const semCat = await X.lancarMovimentos(ext.id, [entrada.id], { nome: 'Elisa', id: null });
  assert.equal(semCat.lancados, 0);
  assert.match(semCat.falhas[0].motivo, /categoria/i);

  await assert.rejects(X.editarMovimento(entrada.id, { categoria_id: catPap }), /incompatível/);
  await X.editarMovimento(entrada.id, { categoria_id: catRec, cliente: 'Alfa' });
  await X.editarMovimento(compra1.id, { categoria_id: catPap });
  await X.editarMovimento(compra2.id, { categoria_id: catPap });

  await S.fecharDia('2026-03-10'); // dia da entrada fica fechado
  const r = await X.lancarMovimentos(ext.id, [entrada.id, compra1.id, compra2.id], { nome: 'Elisa', id: null });
  assert.equal(r.lancados, 2);
  assert.match(r.falhas[0].motivo, /fechado/);

  const lancs = await S.listarLancamentos({ de: '2026-03-11', ate: '2026-03-11' });
  assert.equal(lancs.length, 2);
  assert.equal(lancs[0].conta, 'Banco Safra');
  assert.equal(lancs[0].criado_por, 'Elisa (extrato)');
  const reproc = await X.lancarMovimentos(ext.id, [compra1.id], { nome: 'Elisa', id: null });
  assert.equal(reproc.lancados, 0, 'não lança duas vezes');

  const regra = await one("SELECT * FROM regras_classificacao WHERE termo = 'papelaria central'");
  assert.equal(regra.categoria_id, catPap);
});

test('próximo extrato usa a regra aprendida (confiança alta) sem IA', async () => {
  const ofx2 = OFX.replace(/20260311/g, '20260320').replace(/CENTRAL 0042/g, 'CENTRAL 0099').replace('FITID>2', 'FITID>22');
  const r = await X.importarExtrato({ conta_id: safra, nome: 'abril.ofx', base64: b64(ofx2), usuario: 'Elisa' });
  const d = await X.detalheExtrato(r.id);
  const compra = d.movimentos.find((m) => m.descricao.includes('PAPELARIA'));
  assert.equal(compra.confianca, 'alta');
  assert.equal(compra.categoria, 'Papelaria');
});

test('CSV: separador ; , vírgula decimal e colunas débito/crédito', async () => {
  const csv = 'Data;Histórico;Débito;Crédito\n05/04/2026;TARIFA MANUTENCAO;29,90;\n06/04/2026;DEPOSITO CLIENTE BETA;;2.500,00\n';
  const r = await X.importarExtrato({ conta_id: safra, nome: 'x.csv', base64: b64(csv), usuario: 'Elisa' });
  const d = await X.detalheExtrato(r.id);
  assert.deepEqual(d.movimentos.map((m) => [m.data, m.tipo, m.valor]), [['2026-04-05', 'saida', 2990], ['2026-04-06', 'entrada', 250000]]);
  await assert.rejects(X.importarExtrato({ conta_id: safra, nome: 'ruim.csv', base64: b64('a;b\n1;2\n'), usuario: 'x' }), /cabeçalho|colunas/);
});

test('PDF sem IA configurada: erro claro, nada é gravado', async () => {
  const antes = (await one('SELECT COUNT(*) n FROM extratos')).n;
  await assert.rejects(X.importarExtrato({ conta_id: safra, nome: 'e.pdf', base64: b64('%PDF-1.4 fake'), usuario: 'x' }), /ANTHROPIC_API_KEY/);
  assert.equal((await one('SELECT COUNT(*) n FROM extratos')).n, antes);
});

test('PDF com IA (simulada): lê, classifica com nomes exatos e rejeita categoria de tipo errado', async () => {
  const chamadas = [];
  X.setIA({ messages: { parse: async (req) => {
    chamadas.push(req);
    if (String(req.system).startsWith('Você extrai')) {
      assert.equal(req.model, 'claude-opus-5-5');
      assert.equal(req.messages[0].content[0].type, 'document');
      return { stop_reason: 'end_turn', parsed_output: { observacao: '', lancamentos: [
        { data: '2026-05-04', descricao: 'PIX ENVIADO FATIMA', valor_centavos: 180000, tipo: 'saida' },
        { data: '2026-05-05', descricao: 'TED RECEBIDA GAMA SA', valor_centavos: 990000, tipo: 'entrada' },
        { data: '2026-05-06', descricao: 'COISA ESTRANHA', valor_centavos: 1000, tipo: 'saida' },
      ] } };
    }
    return { stop_reason: 'end_turn', parsed_output: { itens: [
      { i: 0, categoria: 'Salário', pessoa: 'Fátima', cliente: null, confianca: 'alta', motivo: 'PIX para funcionária' },
      { i: 1, categoria: 'Salário', pessoa: null, cliente: 'Gama SA', confianca: 'alta', motivo: 'categoria errada de propósito' },
      { i: 2, categoria: 'Inventada', pessoa: null, cliente: null, confianca: 'alta', motivo: '?' },
    ] } };
  } } });
  const r = await X.importarExtrato({ conta_id: safra, nome: 'e.pdf', base64: b64('%PDF-1.4 conteudo'), usuario: 'Elisa' });
  assert.equal(r.formato, 'pdf');
  assert.equal(chamadas.length, 2);
  const m = (await X.detalheExtrato(r.id)).movimentos;
  assert.equal(m[0].categoria, 'Salário');
  assert.equal(m[0].pessoa, 'Fátima');
  assert.equal(m[1].categoria_id, null, 'Salário não pode ser usada numa entrada');
  assert.equal(m[1].confianca, 'baixa');
  assert.equal(m[1].cliente, 'Gama SA');
  assert.equal(m[2].categoria_id, null, 'categoria inexistente é descartada');
  X.setIA(null);
});

test('falha da IA na classificação não derruba a importação', async () => {
  const Anthropic = (await import('@anthropic-ai/sdk')).default;
  X.setIA({ messages: { parse: async (req) => {
    if (String(req.system).startsWith('Você extrai')) return { stop_reason: 'end_turn', parsed_output: { observacao: 'página 2 ilegível', lancamentos: [{ data: '2026-06-01', descricao: 'X', valor_centavos: 500, tipo: 'saida' }] } };
    throw new Anthropic.APIError(529, {}, 'overloaded', new Headers());
  } } });
  const r = await X.importarExtrato({ conta_id: safra, nome: 'f.pdf', base64: b64('%PDF-1.7 x'), usuario: 'Elisa' });
  assert.equal(r.novos, 1);
  assert.equal(r.observacao, 'página 2 ilegível');
  X.setIA(null);
});

test('arquivo grande e formato desconhecido', async () => {
  await assert.rejects(X.importarExtrato({ conta_id: safra, nome: 'g.ofx', base64: Buffer.alloc(X.MAX_BYTES + 1).toString('base64'), usuario: 'x' }), /3 MB/);
  await assert.rejects(X.importarExtrato({ conta_id: safra, nome: 'g.zip', base64: b64('PK\x03\x04zzzz'), usuario: 'x' }), /Formato não suportado/);
});
