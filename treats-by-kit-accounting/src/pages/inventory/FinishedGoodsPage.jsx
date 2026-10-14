import ItemCatalog from '../../components/inventory/ItemCatalog'

const FINISHED_CATEGORIES = [{ value: 'finished_good', label: 'Finished good' }]

export default function FinishedGoodsPage() {
  return (
    <ItemCatalog
      category="finished_good"
      categoryOptions={FINISHED_CATEGORIES}
      title="Menu"
      description="What the counter can sell. Set a price. In stock stays 0 until the kitchen bakes a batch."
      showSellingPrice
      emptyTitle="No products yet"
      emptyDescription="Add something you sell, such as Buko Pie, and set its price."
    />
  )
}
