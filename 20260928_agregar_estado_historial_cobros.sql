-- Agregar columnas a la tabla historial_cobros
ALTER TABLE historial_cobros 
ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'Activo',
ADD COLUMN IF NOT EXISTS monto_reembolsado NUMERIC(10,2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS motivo_reembolso TEXT,
ADD COLUMN IF NOT EXISTS fecha_cancelacion TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS usuario_captura TEXT;

-- Refrescar la caché del esquema de Supabase
NOTIFY pgrst, 'reload schema';