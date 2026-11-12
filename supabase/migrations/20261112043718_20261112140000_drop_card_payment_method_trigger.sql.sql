/*
# Stop cards from appearing as payment methods

1. Plain-English explanation
- A trigger created a payment method copy ("Cartão ...") for every registered
  card, so cards appeared duplicated in the payment methods page. Cards are now
  managed exclusively on the Cards page.

2. Changes
- Drops the trigger `create_payment_method_on_card_insert` and its function.
- Deletes existing payment method rows that were auto-created from cards
  (names starting with 'Cartão '), only where no transaction references them;
  referenced rows are archived (status 'archived') instead so history is kept.

3. Security changes
- None.
*/

DROP TRIGGER IF EXISTS create_payment_method_on_card_insert ON cards;
DROP FUNCTION IF EXISTS create_payment_method_for_card();

WITH removed AS (
  UPDATE payment_methods
  SET status = 'archived'
  WHERE name LIKE 'Cartão %'
    AND id IN (SELECT payment_method_id FROM transactions WHERE payment_method_id IS NOT NULL)
  RETURNING id
)
DELETE FROM payment_methods
WHERE name LIKE 'Cartão %'
  AND id NOT IN (SELECT id FROM removed);
