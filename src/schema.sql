-- Esquema do Controle Financeiro OnTrade/LTON (PostgreSQL).
-- Valores monetários em centavos (bigint). Horários em America/Sao_Paulo.
-- RLS ligado e SEM políticas: a API pública do Supabase (anon/authenticated) não enxerga nada;
-- apenas o servidor, conectando direto ao Postgres, acessa os dados.

CREATE TABLE IF NOT EXISTS empresas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  obs text
);

CREATE TABLE IF NOT EXISTS contas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  empresa_id bigint NOT NULL REFERENCES empresas(id),
  tipo text NOT NULL CHECK (tipo IN ('banco','dinheiro','intermediaria','pessoal')),
  modalidade text NOT NULL CHECK (modalidade IN ('com_nota','sem_nota')),
  saldo_inicial bigint NOT NULL DEFAULT 0,
  ativo integer NOT NULL DEFAULT 1,
  obs text
);

CREATE TABLE IF NOT EXISTS categorias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  grupo text NOT NULL,
  ativo integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS pessoas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  funcao text,
  vinculo text NOT NULL DEFAULT 'a_verificar'
    CHECK (vinculo IN ('lt1','ontrade','japeri','informal','socio','a_verificar')),
  pagador_padrao text,
  obs text,
  ativo integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS lancamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data date NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida','transferencia')),
  valor bigint NOT NULL CHECK (valor > 0),
  conta_id bigint NOT NULL REFERENCES contas(id),
  conta_destino_id bigint REFERENCES contas(id),
  categoria_id bigint REFERENCES categorias(id),
  pessoa_id bigint REFERENCES pessoas(id),
  cliente text,
  descricao text,
  criado_por text,
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);
CREATE INDEX IF NOT EXISTS idx_lanc_data ON lancamentos(data);
CREATE INDEX IF NOT EXISTS idx_lanc_conta ON lancamentos(conta_id);
CREATE INDEX IF NOT EXISTS idx_lanc_destino ON lancamentos(conta_destino_id);
CREATE INDEX IF NOT EXISTS idx_lanc_categoria ON lancamentos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_lanc_pessoa ON lancamentos(pessoa_id);

CREATE TABLE IF NOT EXISTS recorrencias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  dia_mes integer NOT NULL CHECK (dia_mes BETWEEN 1 AND 31),
  valor bigint,
  estimado integer NOT NULL DEFAULT 1,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida','transferencia')),
  conta_id bigint NOT NULL REFERENCES contas(id),
  conta_destino_id bigint REFERENCES contas(id),
  categoria_id bigint REFERENCES categorias(id),
  pessoa_id bigint REFERENCES pessoas(id),
  descricao text,
  ativo integer NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_rec_conta ON recorrencias(conta_id);

CREATE TABLE IF NOT EXISTS fechamentos (
  data date PRIMARY KEY,
  obs text,
  fechado_por text,
  fechado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);

CREATE TABLE IF NOT EXISTS fechamento_contas (
  data date NOT NULL REFERENCES fechamentos(data) ON DELETE CASCADE,
  conta_id bigint NOT NULL REFERENCES contas(id),
  saldo_sistema bigint NOT NULL,
  saldo_contado bigint,
  PRIMARY KEY (data, conta_id)
);
CREATE INDEX IF NOT EXISTS idx_fc_conta ON fechamento_contas(conta_id);

CREATE TABLE IF NOT EXISTS recorrencia_lancada (
  recorrencia_id bigint NOT NULL REFERENCES recorrencias(id) ON DELETE CASCADE,
  mes text NOT NULL,
  lancamento_id bigint NOT NULL REFERENCES lancamentos(id) ON DELETE CASCADE,
  PRIMARY KEY (recorrencia_id, mes)
);
CREATE INDEX IF NOT EXISTS idx_rl_lanc ON recorrencia_lancada(lancamento_id);

CREATE TABLE IF NOT EXISTS usuarios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  senha_hash text NOT NULL,
  papel text NOT NULL CHECK (papel IN ('admin','operador','leitor')),
  ativo integer NOT NULL DEFAULT 1,
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo'),
  ultimo_acesso timestamp
);

CREATE TABLE IF NOT EXISTS sessoes (
  token_hash text PRIMARY KEY,
  usuario_id bigint NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em bigint NOT NULL,
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);
CREATE INDEX IF NOT EXISTS idx_sess_usuario ON sessoes(usuario_id);

CREATE TABLE IF NOT EXISTS tentativas_login (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  chave text NOT NULL,
  em bigint NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tent_chave ON tentativas_login(chave, em);

ALTER TABLE empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE pessoas ENABLE ROW LEVEL SECURITY;
ALTER TABLE lancamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencias ENABLE ROW LEVEL SECURITY;
ALTER TABLE fechamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fechamento_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE recorrencia_lancada ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tentativas_login ENABLE ROW LEVEL SECURITY;

-- ---------- Extratos bancários (importação com IA) ----------
CREATE TABLE IF NOT EXISTS extratos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conta_id bigint NOT NULL REFERENCES contas(id),
  arquivo_nome text NOT NULL,
  formato text NOT NULL,
  enviado_por text,
  enviado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo'),
  usou_ia integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_extr_conta ON extratos(conta_id);

CREATE TABLE IF NOT EXISTS movimentos_importados (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  extrato_id bigint NOT NULL REFERENCES extratos(id) ON DELETE CASCADE,
  conta_id bigint NOT NULL REFERENCES contas(id),
  data date NOT NULL,
  descricao text NOT NULL,
  valor bigint NOT NULL CHECK (valor > 0),
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  categoria_id bigint REFERENCES categorias(id),
  pessoa_id bigint REFERENCES pessoas(id),
  cliente text,
  confianca text NOT NULL DEFAULT 'baixa' CHECK (confianca IN ('alta','media','baixa')),
  motivo text,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','lancado','ignorado')),
  lancamento_id bigint REFERENCES lancamentos(id) ON DELETE SET NULL,
  hash text NOT NULL,
  UNIQUE (conta_id, hash)
);
CREATE INDEX IF NOT EXISTS idx_mov_extrato ON movimentos_importados(extrato_id);
CREATE INDEX IF NOT EXISTS idx_mov_categoria ON movimentos_importados(categoria_id);
CREATE INDEX IF NOT EXISTS idx_mov_pessoa ON movimentos_importados(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_mov_lanc ON movimentos_importados(lancamento_id);

-- O sistema aprende: cada vez que alguém confirma uma classificação, ela vira regra.
CREATE TABLE IF NOT EXISTS regras_classificacao (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  termo text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('entrada','saida')),
  categoria_id bigint REFERENCES categorias(id),
  pessoa_id bigint REFERENCES pessoas(id),
  usos integer NOT NULL DEFAULT 1,
  atualizado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo'),
  UNIQUE (termo, tipo)
);
CREATE INDEX IF NOT EXISTS idx_regra_categoria ON regras_classificacao(categoria_id);
CREATE INDEX IF NOT EXISTS idx_regra_pessoa ON regras_classificacao(pessoa_id);

ALTER TABLE extratos ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentos_importados ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras_classificacao ENABLE ROW LEVEL SECURITY;

-- ---------- Quem fez cada coisa, fotos e confirmação de fechamento ----------
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto text;            -- JPEG 256x256 em base64 (sem prefixo)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS foto_em timestamp;
ALTER TABLE lancamentos ADD COLUMN IF NOT EXISTS criado_por_id bigint REFERENCES usuarios(id);
CREATE INDEX IF NOT EXISTS idx_lanc_criador ON lancamentos(criado_por_id);
ALTER TABLE fechamentos ADD COLUMN IF NOT EXISTS fechado_por_id bigint REFERENCES usuarios(id);
ALTER TABLE fechamentos ADD COLUMN IF NOT EXISTS confirmacao text;  -- JSON: itens do checklist marcados
CREATE INDEX IF NOT EXISTS idx_fech_usuario ON fechamentos(fechado_por_id);

-- Novos perfis: sócio (consulta financeira e quadro societário) e comercial (CRM e orçamentos)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_papel_check' AND pg_get_constraintdef(oid) LIKE '%comercial%') THEN
    ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_papel_check;
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_papel_check CHECK (papel IN ('admin','operador','leitor','socio','comercial'));
  END IF;
END $$;

-- ---------- Quadro societário e patrimônio em ativos ----------
CREATE TABLE IF NOT EXISTS socios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  documento text,
  participacao_bp integer CHECK (participacao_bp IS NULL OR participacao_bp BETWEEN 0 AND 10000), -- 10000 = 100,00%
  aporte bigint NOT NULL DEFAULT 0,
  data_entrada date,
  obs text,
  ativo integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS patrimonio_itens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mes text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('container','estoque')),
  descricao text NOT NULL,
  valor bigint NOT NULL CHECK (valor >= 0),
  situacao text NOT NULL DEFAULT 'em_transito' CHECK (situacao IN ('em_transito','no_porto','em_estoque','outro')),
  previsao_chegada date,
  obs text,
  criado_por text,
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);
CREATE INDEX IF NOT EXISTS idx_pat_mes ON patrimonio_itens(mes);

CREATE TABLE IF NOT EXISTS relatorio_notas (
  mes text PRIMARY KEY,
  texto text,
  atualizado_por text,
  atualizado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);

ALTER TABLE socios ENABLE ROW LEVEL SECURITY;
ALTER TABLE patrimonio_itens ENABLE ROW LEVEL SECURITY;
ALTER TABLE relatorio_notas ENABLE ROW LEVEL SECURITY;

-- ---------- Comercial: clientes (CRM), orçamentos e follow-up ----------
CREATE TABLE IF NOT EXISTS clientes (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  telefone text,
  email text,
  aniversario date,
  empresa text,
  origem text,
  obs text,
  criado_por_id bigint REFERENCES usuarios(id),
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);
CREATE INDEX IF NOT EXISTS idx_cli_nome ON clientes (lower(nome));
CREATE INDEX IF NOT EXISTS idx_cli_criador ON clientes (criado_por_id);

CREATE TABLE IF NOT EXISTS produtos_catalogo (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL UNIQUE,
  ativo integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orcamentos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero text,
  cliente_id bigint NOT NULL REFERENCES clientes(id),
  produto_id bigint REFERENCES produtos_catalogo(id),
  produto_desc text,
  valor bigint NOT NULL CHECK (valor >= 0),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','ganho','perdido','cancelado')),
  motivo text,
  cliente_tipo text NOT NULL CHECK (cliente_tipo IN ('novo','recorrente')),
  data date NOT NULL,
  followup_em date,
  fechado_em timestamp,
  fechado_por_id bigint REFERENCES usuarios(id),
  obs text,
  criado_por_id bigint REFERENCES usuarios(id),
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);
CREATE INDEX IF NOT EXISTS idx_orc_data ON orcamentos (data);
CREATE INDEX IF NOT EXISTS idx_orc_cliente ON orcamentos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_orc_status_follow ON orcamentos (status, followup_em);
CREATE INDEX IF NOT EXISTS idx_orc_produto ON orcamentos (produto_id);
CREATE INDEX IF NOT EXISTS idx_orc_criador ON orcamentos (criado_por_id);
CREATE INDEX IF NOT EXISTS idx_orc_fechador ON orcamentos (fechado_por_id);

CREATE TABLE IF NOT EXISTS contatos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  orcamento_id bigint NOT NULL REFERENCES orcamentos(id) ON DELETE CASCADE,
  cliente_id bigint NOT NULL REFERENCES clientes(id),
  usuario_id bigint REFERENCES usuarios(id),
  tipo text NOT NULL DEFAULT 'follow-up',
  nota text,
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);
CREATE INDEX IF NOT EXISTS idx_cont_orc ON contatos (orcamento_id);
CREATE INDEX IF NOT EXISTS idx_cont_cliente ON contatos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_cont_usuario ON contatos (usuario_id);

ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE contatos ENABLE ROW LEVEL SECURITY;

-- ---------- Departamento de Pessoas: fichas dos funcionários e controle de ausências ----------
CREATE TABLE IF NOT EXISTS funcionarios (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pessoa_id bigint UNIQUE REFERENCES pessoas(id),
  nome text NOT NULL,
  apelido text,
  data_nascimento date,
  sexo text,
  estado_civil text,
  nacionalidade text,
  naturalidade text,
  escolaridade text,
  nome_mae text,
  nome_pai text,
  dependentes text,
  cpf text,
  rg text,
  rg_orgao text,
  titulo_eleitor text,
  cnh text,
  pis text,
  ctps_numero text,
  ctps_serie text,
  ctps_uf text,
  ctps_emissao date,
  telefone text,
  email text,
  cep text,
  endereco text,
  numero text,
  complemento text,
  bairro text,
  cidade text,
  uf text,
  emergencia_nome text,
  emergencia_parentesco text,
  emergencia_telefone text,
  plano_saude text,
  plano_saude_numero text,
  tipo_sanguineo text,
  alergias text,
  aso_admissional date,
  aso_validade date,
  cargo text,
  setor text,
  vinculo text NOT NULL DEFAULT 'a_verificar' CHECK (vinculo IN ('lt1','ontrade','japeri','informal','socio','a_verificar')),
  regime text NOT NULL DEFAULT 'a_verificar' CHECK (regime IN ('clt','pj','comissionado','prestador','informal','a_verificar')),
  data_admissao date,
  data_demissao date,
  salario bigint CHECK (salario IS NULL OR salario >= 0),
  vale_transporte text,
  tamanho_uniforme text,
  banco text,
  agencia text,
  conta text,
  pix text,
  jornada_entrada text,
  jornada_saida text,
  jornada_intervalo_min integer,
  dias_trabalho text NOT NULL DEFAULT '1,2,3,4,5',
  obs text,
  ativo integer NOT NULL DEFAULT 1,
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')
);
CREATE INDEX IF NOT EXISTS idx_func_nome ON funcionarios (lower(nome));

CREATE TABLE IF NOT EXISTS ausencias (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  funcionario_id bigint NOT NULL REFERENCES funcionarios(id),
  tipo text NOT NULL CHECK (tipo IN ('falta','atestado','ferias','licenca','folga','atraso')),
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  justificada integer NOT NULL DEFAULT 0,
  obs text,
  anexo_nome text,
  anexo_tipo text,
  anexo_tamanho integer,
  anexo bytea,
  criado_por_id bigint REFERENCES usuarios(id),
  criado_em timestamp NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo'),
  CHECK (data_fim >= data_inicio)
);
CREATE INDEX IF NOT EXISTS idx_aus_func ON ausencias (funcionario_id, data_inicio);
CREATE INDEX IF NOT EXISTS idx_aus_periodo ON ausencias (data_inicio, data_fim);
CREATE INDEX IF NOT EXISTS idx_aus_criador ON ausencias (criado_por_id);

ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE ausencias ENABLE ROW LEVEL SECURITY;
