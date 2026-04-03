-- ============================================
-- MIGRATION: Frete Schema (3-in-1)
-- Projeto: Toth Frete
-- Data: 2026-04-02
-- ============================================

-- 1. Adicionar parametros_calculo e margem_seguranca na tabela transportadoras
ALTER TABLE transportadoras
  ADD COLUMN IF NOT EXISTS parametros_calculo JSONB,
  ADD COLUMN IF NOT EXISTS margem_seguranca NUMERIC DEFAULT 0;

-- 2. Tabela cidade → praça (mapeamento de 656 cidades)
CREATE TABLE IF NOT EXISTS transportadora_cidade_praca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transportadora_id UUID NOT NULL REFERENCES transportadoras(id) ON DELETE CASCADE,
  cidade TEXT NOT NULL,
  estado TEXT,
  praca TEXT NOT NULL,
  unidade TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tcp_lookup
  ON transportadora_cidade_praca(transportadora_id, cidade);

ALTER TABLE transportadora_cidade_praca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full cidade_praca" ON transportadora_cidade_praca
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Read cidade_praca" ON transportadora_cidade_praca
  FOR SELECT TO authenticated USING (true);

-- 3. Tabela de valores de frete por origem × praça × faixa
CREATE TABLE IF NOT EXISTS transportadora_tabela_frete (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transportadora_id UUID NOT NULL REFERENCES transportadoras(id) ON DELETE CASCADE,
  origem_codigo TEXT NOT NULL,
  praca_destino TEXT NOT NULL,
  faixa_idx INTEGER NOT NULL CHECK (faixa_idx BETWEEN 0 AND 8),
  valor NUMERIC NOT NULL CHECK (valor >= 0),
  is_valor_por_m3 BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(transportadora_id, origem_codigo, praca_destino, faixa_idx)
);

CREATE INDEX IF NOT EXISTS idx_ttf_lookup
  ON transportadora_tabela_frete(transportadora_id, origem_codigo, praca_destino);

ALTER TABLE transportadora_tabela_frete ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full tabela_frete" ON transportadora_tabela_frete
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "Read tabela_frete" ON transportadora_tabela_frete
  FOR SELECT TO authenticated USING (true);
