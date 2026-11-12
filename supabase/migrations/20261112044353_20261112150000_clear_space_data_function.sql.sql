/*
# Clear all data of the active space

1. Plain-English explanation
- Adds a "wipe" action: the space owner can erase ALL data recorded in a space
  (transactions, splits, invoice items, invoices, settlements, goals and their
  contributions, budgets, cards, payment methods, categories and accounts).
- The space itself, its members and pending invitations are kept, so the app
  continues usable immediately after, with everything empty.

2. New Functions
- `clear_space_data(p_space_id uuid)` (SECURITY DEFINER, fixed search_path):
  * only the space OWNER may call it; otherwise it raises an error;
  * deletes every data row tied to the space, in dependency-safe order;
  * does NOT touch financial_spaces, space_members or invitations.

3. Security changes
- EXECUTE granted only to `authenticated`; revoked from PUBLIC and anon.
*/

CREATE OR REPLACE FUNCTION public.clear_space_data(p_space_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT owner_id INTO v_owner FROM financial_spaces WHERE id = p_space_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Somente o proprietário pode limpar os dados do espaço.';
  END IF;

  UPDATE transactions SET invoice_item_id = NULL WHERE space_id = p_space_id;
  DELETE FROM invoice_items WHERE invoice_id IN (SELECT id FROM invoices WHERE space_id = p_space_id);
  DELETE FROM transaction_splits WHERE transaction_id IN (SELECT id FROM transactions WHERE space_id = p_space_id);
  DELETE FROM transactions WHERE space_id = p_space_id;
  DELETE FROM invoices WHERE space_id = p_space_id;
  DELETE FROM settlements WHERE space_id = p_space_id;
  DELETE FROM goal_contributions WHERE goal_id IN (SELECT id FROM goals WHERE space_id = p_space_id);
  DELETE FROM goals WHERE space_id = p_space_id;
  DELETE FROM budgets WHERE space_id = p_space_id;
  DELETE FROM cards WHERE space_id = p_space_id;
  DELETE FROM payment_methods WHERE space_id = p_space_id;
  DELETE FROM categories WHERE space_id = p_space_id;
  DELETE FROM accounts WHERE space_id = p_space_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.clear_space_data(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_space_data(uuid) TO authenticated;
