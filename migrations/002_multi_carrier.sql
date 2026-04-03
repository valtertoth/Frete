-- ============================================
-- MIGRATION: Multi-carrier support
-- Projeto: Toth Frete
-- Data: 2026-04-03
-- ============================================

-- 1. Adicionar parametros_override por origem (permite que cada origem
--    de uma transportadora tenha parâmetros diferentes dos defaults)
ALTER TABLE transportadora_origens
  ADD COLUMN IF NOT EXISTS parametros_override JSONB DEFAULT NULL;

COMMENT ON COLUMN transportadora_origens.parametros_override IS
  'Overrides parciais de ParametrosCalculo. Merged sobre transportadora.parametros_calculo em runtime.';

-- 2. Popular origens da Vipex (se existir)
INSERT INTO transportadora_origens (transportadora_id, codigo, nome, tipo, ativo)
SELECT t.id, v.codigo, v.nome, 'dropshipping', true
FROM transportadoras t
CROSS JOIN (VALUES
  ('SP-INT3', 'Dropshipping SP Interior 3'),
  ('SC-INT', 'Dropshipping SC Interior'),
  ('RS-CAP', 'Dropshipping RS Capital'),
  ('RS-INT1', 'Dropshipping RS Interior 1'),
  ('PR-LON', 'Dropshipping PR Londrina (estimado)')
) AS v(codigo, nome)
WHERE t.nome = 'Vipex'
ON CONFLICT DO NOTHING;

-- 3. Override de parâmetros para PR-LON
UPDATE transportadora_origens
SET parametros_override = '{
  "despacho": 30.0,
  "gris": 0.009,
  "grisPorEstado": {},
  "pedagioTipo": "por_fracao_m3",
  "pedagioValor": 15.0,
  "txDifAcessoPorPraca": {}
}'::jsonb
WHERE codigo = 'PR-LON'
  AND transportadora_id = (SELECT id FROM transportadoras WHERE nome = 'Vipex')
  AND parametros_override IS NULL;
