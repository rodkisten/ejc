-- Cartinhas enviadas não dependem mais de moderação e nunca são públicas.
-- Colunas antigas permanecem temporariamente para preservar instalações existentes.
UPDATE orders SET public_message=0,release_override=0,moderation_note='';
UPDATE orders SET moderation='approved',approved_at=COALESCE(approved_at,submitted_at)
  WHERE submitted_at IS NOT NULL;
-- Convites de mural que podiam ser emitidos pelo painel administrativo são revogados.
-- Os códigos individuais impressos continuam válidos.
UPDATE recipients SET mural_token_hash=NULL WHERE mural_token_hash IS NOT NULL;
