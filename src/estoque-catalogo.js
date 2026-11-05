// Catálogo do estoque: entende o nome do produto (tipo, pitch, uso indoor/outdoor, medida e lote) e monta o texto de busca.
// Sem acesso ao banco: usado pelo servidor ao salvar um item e pela importação das listas de produtos.

export const TIPOS = {
  gabinete: 'Gabinete (painel)', modulo: 'Módulo', pcb: 'PCB', receiver: 'Placa receptora (receiver)',
  processador: 'Processador de vídeo', totem: 'Totem / monitor', peca: 'Peça / acessório', outro: 'Outro',
};
export const AMBIENTES = { indoor: 'Indoor', outdoor: 'Outdoor' };

// minúsculas, sem acento, vírgula decimal vira ponto, espaços simples
export const normaliza = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim();

// número com unidade → centímetros. Até 3 sem unidade (ou mesmo "cm" escrito por engano, como 0,64cm) é metro; 100 ou mais é milímetro.
function emCm(valor, unidade) {
  const v = Number(String(valor).replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) return null;
  if (unidade === 'mm') return v / 10;
  if (v <= 3) return v * 100;
  if (unidade === 'm') return v * 100;
  if (v >= 100) return v / 10;
  return v;
}
const fmt = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));

export function classificar(nome) {
  const n = normaliza(nome).replace(/0utdoor/g, 'outdoor').replace(/out door|outdood/g, 'outdoor');
  let tipo = 'outro';
  if (/receiver|receptora/.test(n)) tipo = 'receiver';
  else if (/processador de video|\blvp\b/.test(n)) tipo = 'processador';
  else if (/totem|monitor/.test(n)) tipo = 'totem';
  else if (/\bpcb\b|circuito impresso/.test(n)) tipo = 'pcb';
  else if (/modulo/.test(n)) tipo = 'modulo';
  else if (/chapinha|parafuso|cabo|fonte|trava/.test(n)) tipo = 'peca';
  else if (/painel|gabinete|^p\d/.test(n)) tipo = 'gabinete';

  let pitch = null;
  const m = n.match(/\bp\s?(\d{1,2}(?:\.\d{1,2})?)\s?(?:mm)?\b/) || (tipo === 'totem' && n.match(/\b(\d\.\d{1,2})\b/));
  if (m) {
    const v = m[1];
    pitch = v === '3.91' ? 'P3.9' : `P${v}`; // P3.9 e P3.91 são o mesmo pitch (3,91 mm)
  }
  const ambiente = /outdoor/.test(n) ? 'outdoor' : /indoor/.test(n) ? 'indoor' : null;

  let dimensao = null;
  const d = n.match(/(\d+(?:\.\d+)?)\s*(mm|cm|m)?\s*x\s*(\d+(?:\.\d+)?)\s*(mm|cm|m)?/);
  if (d) {
    const u2 = d[4], u1 = d[2] || (u2 === 'mm' ? 'mm' : undefined);
    const a = emCm(d[1], u1), b = emCm(d[3], u2);
    if (a && b) { const [x, y] = [a, b].sort((p, q) => q - p); dimensao = `${fmt(x)}x${fmt(y)} cm`; }
  }

  let lote = null;
  const l = n.match(/lote\s*0?(\d{1,2})/);
  if (l) lote = l[1].padStart(2, '0');
  const linha = /onpro/.test(n) ? 'ONPRO' : /bsl light/.test(n) ? 'BSL Light' : null;
  if (linha) lote = lote ? `${lote} (${linha})` : linha;
  return { tipo, pitch, ambiente, dimensao, lote };
}

// Texto de busca: nome, código, tipo, pitch com variações (p3.9, p3.91, 3.9, p39...), uso, medida nas duas ordens, lote e marca, com sinônimos
export function montaBusca(i) {
  const partes = [i.nome, i.codigo, TIPOS[i.tipo], i.tipo, AMBIENTES[i.ambiente], i.marca, i.lote && `lote ${i.lote}`];
  if (i.pitch) {
    const v = i.pitch.replace(/^p/i, '');
    partes.push(`p${v}`, v, `p${v.replace('.', '')}`);
    if (v === '3.9') partes.push('p3.91', '3.91', 'p391');
  }
  if (i.dimensao) {
    const [x, y] = i.dimensao.replace(' cm', '').split('x');
    partes.push(i.dimensao, `${y}x${x}`, `${x}x${y}`);
  }
  if (i.tipo === 'gabinete') partes.push('painel gabinete tela');
  if (i.tipo === 'receiver') partes.push('placa receptora receiver');
  if (i.tipo === 'processador') partes.push('processador video controladora');
  return normaliza(partes.filter(Boolean).join(' '));
}

// termos da busca: cada um precisa aparecer (em qualquer ordem)
export const termosBusca = (q) => normaliza(q).split(' ').filter(Boolean);
