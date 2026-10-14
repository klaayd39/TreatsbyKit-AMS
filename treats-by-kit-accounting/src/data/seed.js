import { storageKey } from './storage'

/** Bump to reset mock collections in localStorage. */
const SEED_VERSION = '2'
const SEED_VERSION_KEY = 'tbk.seedVersion'

export const COLLECTIONS = {
  ITEMS: 'items',
  SUPPLIERS: 'suppliers',
  RECIPES: 'recipes',
  STOCK_MOVEMENTS: 'stockMovements',
  PURCHASE_INVOICES: 'purchaseInvoices',
  RECEIVING_RECORDS: 'receivingRecords',
  PRODUCTION_BATCHES: 'productionBatches',
  CUSTOMERS: 'customers',
  ORDERS: 'orders',
  SALES: 'sales',
  PAYMENTS: 'payments',
  ACCOUNTS: 'accounts',
  JOURNAL_ENTRIES: 'journalEntries',
  SUPPLIER_PAYMENTS: 'supplierPayments',
  EXPENSES: 'expenses',
  SETTINGS: 'settings',
  NOTIFICATION_STATE: 'notificationState',
}

export const ITEM_CATEGORIES = ['raw_material', 'finished_good', 'packaging']

export const ITEM_UNITS = ['pc', 'kg', 'g', 'L', 'mL', 'pack', 'box']

export const MOVEMENT_TYPES = [
  'purchase',
  'production_use',
  'production_output',
  'sale',
  'waste',
  'adjustment',
]

/**
 * Stock on hand is never stored on an item. It is the sum of quantityIn minus
 * quantityOut across stockMovements for that item.
 * Eggs start with no movements so a receipt of 100 leaves 100 on hand.
 */
export const seedData = {
  [COLLECTIONS.ITEMS]: [
    {
      id: 'item-eggs',
      name: 'Eggs',
      category: 'raw_material',
      unit: 'pc',
      reorderLevel: 24,
    },
    {
      id: 'item-flour',
      name: 'Flour',
      category: 'raw_material',
      unit: 'kg',
      reorderLevel: 5,
    },
    {
      id: 'item-buko-pie',
      name: 'Buko Pie',
      category: 'finished_good',
      unit: 'pc',
      reorderLevel: 4,
    },
  ],
  [COLLECTIONS.SUPPLIERS]: [
    {
      id: 'supplier-1',
      name: 'Laguna Farm Supply',
      contactPerson: 'Ana Reyes',
      phone: '0917 555 0134',
      address: 'Calamba, Laguna',
      notes: '',
    },
  ],
  [COLLECTIONS.RECIPES]: [
    {
      id: 'recipe-buko-pie',
      name: 'Buko Pie',
      finishedItemId: 'item-buko-pie',
      yieldQuantity: 1,
      notes: '',
      ingredients: [
        { itemId: 'item-eggs', quantity: 2 },
        { itemId: 'item-flour', quantity: 3 },
      ],
    },
  ],
  [COLLECTIONS.STOCK_MOVEMENTS]: [
    {
      id: 'mov-flour-opening',
      date: '2026-10-01',
      itemId: 'item-flour',
      type: 'adjustment',
      quantityIn: 20,
      quantityOut: 0,
      unitCost: 0,
      referenceType: 'adjustment',
      referenceId: null,
      notes: 'Opening balance',
      createdAt: '2026-10-01T00:00:00.000Z',
    },
  ],
  [COLLECTIONS.PURCHASE_INVOICES]: [],
  [COLLECTIONS.RECEIVING_RECORDS]: [],
  [COLLECTIONS.PRODUCTION_BATCHES]: [],
  [COLLECTIONS.CUSTOMERS]: [],
  [COLLECTIONS.ORDERS]: [],
  [COLLECTIONS.SALES]: [],
  [COLLECTIONS.PAYMENTS]: [],
  [COLLECTIONS.ACCOUNTS]: [],
  [COLLECTIONS.JOURNAL_ENTRIES]: [],
  [COLLECTIONS.SUPPLIER_PAYMENTS]: [],
  [COLLECTIONS.EXPENSES]: [],
  [COLLECTIONS.SETTINGS]: [],
  [COLLECTIONS.NOTIFICATION_STATE]: [],
}

export function ensureSeeded() {
  try {
    if (localStorage.getItem(SEED_VERSION_KEY) === SEED_VERSION) return
    for (const [collection, rows] of Object.entries(seedData)) {
      localStorage.setItem(storageKey(collection), JSON.stringify(rows))
    }
    localStorage.setItem(SEED_VERSION_KEY, SEED_VERSION)
  } catch {
    // Storage unavailable; reads fall back to empty collections.
  }
}
