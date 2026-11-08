-- Telefone usado exclusivamente no admin para entregar convites do mural por WhatsApp.
-- A OG do mural tem arte própria, sem dados privados de cartinhas.
ALTER TABLE recipients ADD COLUMN whatsapp_phone TEXT NOT NULL DEFAULT '';
ALTER TABLE recipients ADD COLUMN mural_og_key TEXT;
