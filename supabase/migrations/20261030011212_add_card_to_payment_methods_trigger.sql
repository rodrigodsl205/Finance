/*
 * Auto-create a payment_method entry whenever a new card is inserted.
 * This keeps cards and payment methods in sync so cards appear as
 * selectable payment methods in transactions.
 * Uses a unique name pattern "Cartão <name>" to avoid duplicates.
 */

CREATE OR REPLACE FUNCTION create_payment_method_for_card()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only create for new inserts, not updates
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO payment_methods (space_id, name, is_default, status)
    VALUES (NEW.space_id, 'Cartão ' || NEW.name, false, 'active')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS create_payment_method_on_card_insert ON cards;
CREATE TRIGGER create_payment_method_on_card_insert
  AFTER INSERT ON cards
  FOR EACH ROW
  EXECUTE FUNCTION create_payment_method_for_card();
