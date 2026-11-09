-- Update seed function to include kind column
CREATE OR REPLACE FUNCTION seed_default_payment_methods()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO payment_methods (space_id, name, kind, is_default) VALUES
    (NEW.id, 'PIX', 'expense', true),
    (NEW.id, 'PIX', 'income', false),
    (NEW.id, 'Dinheiro', 'expense', false),
    (NEW.id, 'Dinheiro', 'income', false),
    (NEW.id, 'Cartão de débito', 'expense', false),
    (NEW.id, 'Cartão de crédito', 'expense', false),
    (NEW.id, 'Transferência bancária', 'expense', false),
    (NEW.id, 'Transferência bancária', 'income', false),
    (NEW.id, 'Boleto', 'expense', false)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

-- Update card trigger function to include kind
CREATE OR REPLACE FUNCTION create_payment_method_for_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO payment_methods (space_id, name, kind, is_default, status)
    VALUES (NEW.space_id, 'Cartão ' || NEW.name, 'expense', false, 'active')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

-- Backfill existing payment_methods with kind
UPDATE payment_methods SET kind = 'expense' WHERE kind IS NULL OR kind = '';
