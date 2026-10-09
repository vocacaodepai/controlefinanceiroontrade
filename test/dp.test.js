import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.DB_PATH = ':memory:';
const { seed } = await import('../src/seed.js');
const { iniciar, query } = await import('../src/db.js');
const S = await import('../src/services.js');
const DP = await import('../src/dp.js');
const { AREAS } = await import('../src/auth.js');

await iniciar(seed);
const hoje = S.hoje();
const PDF = Buffer.from('%PDF-1.4\n%teste\n').toString('base64');

test('fichas nascem para a equipe e a diretoria/gerência fica em grupo separado', async () => {
  const l = await DP.listar();
  const equipe = l.filter((f) => f.grupo === 'funcionario').map((f) => f.nome);
  for (const n of ['Kátia', 'Fátima', 'João', 'Tayane', 'Carla', 'Fabiano', 'Douglas', 'Andresa', 'Dantas']) assert.ok(equipe.includes(n), n);
  for (const n of ['Renato', 'Renato Sampaio', 'Luiz Túlio', 'Luiz Amaro', 'Elisa Maria', 'Bruno Danello']) assert.ok(!equipe.includes(n), n + ' não é da equipe');
  const gestao = l.filter((f) => f.grupo === 'gestao');
  assert.deepEqual(gestao.map((f) => f.nome).sort(), ['Bruno Danello', 'Elisa Maria', 'Luiz Amaro', 'Luiz Túlio', 'Renato Sampaio']);
  assert.equal(gestao.find((f) => f.nome === 'Elisa Maria').cargo, 'Sócia e Gerente Financeira');
  assert.equal(gestao.find((f) => f.nome === 'Luiz Amaro').regime, 'socio');
  assert.equal(gestao.find((f) => f.nome === 'Bruno Danello').cargo, 'Gerente');
  assert.equal(l[0].grupo, 'gestao', 'a gestão vem primeiro na lista');
  assert.equal(l.find((f) => f.nome === 'Fabiano').regime, 'comissionado');
  assert.equal(l.find((f) => f.nome === 'Douglas').regime, 'prestador');
  assert.equal(l.find((f) => f.nome === 'João').vinculo, 'lt1');
  assert.ok(l.find((f) => f.nome === 'João').pendencias.length > 0, 'ficha nova aponta o que falta');
  assert.ok(!gestao[0].pendencias.includes('Horário de trabalho') && !gestao[0].pendencias.includes('Carteira de trabalho'), 'gestão não precisa de horário nem de carteira');
});

test('contagem de funcionários ativos não inclui a gestão; ficha de gestão aceita regime sócio', async () => {
  const r = await DP.resumo(S.hoje().slice(0, 7));
  assert.equal(r.ativos, 9);
  assert.equal(r.gestao, 5);
  const bruno = (await DP.listar()).find((f) => f.nome === 'Bruno Danello');
  const salvo = await DP.salvar(bruno.id, { ...bruno, regime: 'socio', grupo: 'gestao', cargo: 'Gerente Comercial' });
  assert.equal(salvo.regime, 'socio');
  const novo = await DP.salvar(null, { nome: 'Fulano Teste', grupo: 'gestao', regime: 'a_verificar' });
  assert.equal(novo.grupo, 'gestao');
  assert.equal((await DP.salvar(null, { nome: 'Sicrano Teste' })).grupo, 'funcionario');
});

test('ficha completa: CPF validado, jornada em horas, pendências somem', async () => {
  const joao = (await DP.listar()).find((f) => f.nome === 'João');
  await assert.rejects(DP.salvar(joao.id, { ...joao, cpf: '111.111.111-11' }), /CPF inválido/);
  await assert.rejects(DP.salvar(joao.id, { ...joao, jornada_entrada: '25:00' }), /Horário/);
  const f = await DP.salvar(joao.id, { ...joao, cpf: '529.982.247-25', data_nascimento: '1992-10-20', telefone: '21 98888-0000', endereco: 'Rua A, 10', emergencia_nome: 'Maria', emergencia_telefone: '21 97777-0000',
    data_admissao: '2024-02-01', ctps_numero: '123456', ctps_serie: '0001', ctps_uf: 'rj', tipo_sanguineo: 'O+', plano_saude: 'Unimed', jornada_entrada: '08:00', jornada_saida: '17:00', jornada_intervalo_min: 60, salario: 250000, regime: 'clt' });
  assert.equal(f.cpf, '52998224725');
  assert.equal(f.ctps_uf, 'RJ');
  assert.equal(f.jornada_horas, 8);
  assert.deepEqual(f.pendencias, []);
  assert.equal(DP.cpfValido('52998224725'), true);
});

test('dias de ausência contam só os dias de trabalho', () => {
  assert.equal(DP.diasAfetados('2026-10-05', '2026-10-11'), 5); // seg a dom, jornada seg-sex
  assert.equal(DP.diasAfetados('2026-10-05', '2026-10-11', '1,2,3,4,5,6'), 6);
});

test('atestado com anexo: valida o tipo do arquivo, guarda, devolve e bloqueia choque de datas', async () => {
  const joao = (await DP.listar()).find((f) => f.nome === 'João');
  await assert.rejects(DP.criarAusencia({ funcionario_id: joao.id, tipo: 'atestado', data_inicio: '2026-10-05', anexo: { nome: 'x.exe', base64: Buffer.from('MZ-programa').toString('base64') } }, null), /PDF, JPG ou PNG/);
  const a = await DP.criarAusencia({ funcionario_id: joao.id, tipo: 'atestado', data_inicio: '2026-10-05', data_fim: '2026-10-07', anexo: { nome: 'atestado joao.pdf', base64: PDF } }, null);
  assert.equal(a.anexo_tipo, 'application/pdf');
  assert.equal(a.justificada, 1);
  const baixado = await DP.lerAnexoAusencia(a.id);
  assert.equal(baixado.buf.subarray(0, 4).toString(), '%PDF');
  await assert.rejects(DP.criarAusencia({ funcionario_id: joao.id, tipo: 'falta', data_inicio: '2026-10-07' }, null), /Já existe/);
  await assert.rejects(DP.criarAusencia({ funcionario_id: joao.id, tipo: 'falta', data_inicio: '2026-10-09', data_fim: '2026-10-08' }, null), /antes/);
  const grande = Buffer.alloc(3 * 1024 * 1024 + 10, 1); grande.write('%PDF');
  await assert.rejects(DP.criarAusencia({ funcionario_id: joao.id, tipo: 'falta', data_inicio: '2026-10-20', anexo: { base64: grande.toString('base64') } }, null), /3 MB/);
  const ficha = await DP.ficha(joao.id);
  assert.equal(ficha.ausencias[0].dias_uteis, 3);
  assert.equal(ficha.ausencias[0].anexo, undefined, 'a lista não carrega o arquivo');
});

test('resumo do mês: dias, horas, injustificadas, quem está fora hoje e aniversariantes', async () => {
  const carla = (await DP.listar()).find((f) => f.nome === 'Carla');
  await DP.salvar(carla.id, { ...carla, data_nascimento: `1990-${hoje.slice(5, 7)}-15`, jornada_entrada: '09:00', jornada_saida: '18:00', jornada_intervalo_min: 60 });
  await DP.criarAusencia({ funcionario_id: carla.id, tipo: 'falta', data_inicio: hoje, data_fim: hoje, justificada: false }, null);
  const r = await DP.resumo(hoje.slice(0, 7));
  const j = r.por_pessoa.find((p) => p.nome === 'João'), c = r.por_pessoa.find((p) => p.nome === 'Carla');
  assert.equal(j.atestado, hoje.slice(0, 7) === '2026-10' ? 3 : 0);
  assert.ok(c.falta === (new Date(hoje + 'T12:00:00Z').getUTCDay() % 6 === 0 ? 0 : 1));
  assert.ok(r.aniversarios.some((x) => x.nome === 'Carla' && x.dia === 15));
  assert.ok(r.fichas_incompletas.length > 0);
});

test('só o administrador tem a área de Departamento de Pessoas', () => {
  assert.ok(AREAS.admin.includes('dp'));
  for (const p of ['operador', 'leitor', 'socio', 'comercial']) assert.ok(!AREAS[p].includes('dp'), p);
});
