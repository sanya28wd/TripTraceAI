# Item Taxonomy

> **Category ID** is the exact string used by detector / VLM / LLM / matcher outputs. Do not use spaces.

| **Category ID** | **Category Label** | **Subcategory Examples** | **Sensitive?** | **Why / Notes** |
|---|---|---|---|---|
| `phone` | Phone | Smartphone, basic phone | No | High-frequency lost item, low harm if misidentified |
| `bag` | Bag | Backpack, handbag, tote, laptop bag | No | Common, visually distinct |
| `wallet` | Wallet | Wallet, cardholder, purse | Yes | Often contains ID/cards |
| `passport_or_id` | Passport / ID | Passport, national ID, driving license | Yes | Sensitive personal document |
| `medication` | Medication | Pill bottle, inhaler, medical device | Yes | Health-sensitive, urgent |
| `electronics_small` | Small Electronics | Earbuds, charger, power bank, smartwatch | No | Common, low sensitivity |
| `electronics_large` | Large Electronics | Laptop, tablet, camera | No | High value, low sensitivity |
| `clothing_accessory` | Clothing / Accessory | Jacket, scarf, hat, glasses, umbrella | No | Common, low ambiguity |
| `keys` | Keys | Keys, key fob | No | Common, small |
| `toy_or_child_item` | Toy / Child Item | Toy, child's bottle, stroller item | No | Common on family trips |
| `document_paper` | Paper Document | Receipt, printed ticket, non-ID paperwork | No | Distinguish from `passport_or_id` |
| `jewelry_or_valuable` | Jewelry / Valuable | Watch, jewelry, small valuable item | Yes | High value, ownership disputes likely |
| `other_unclassified` | Other / Unclassified | Anything not fitting above categories | No | Required fallback — detector must never invent a category |

> **Note:** `no_item` is **NOT** a category. It is a separate boolean flag the detector returns instead of a category. Keep it out of this list.

> **Sensitive categories cannot auto-resolve.** They always route to manual review per the shared rule engine.
