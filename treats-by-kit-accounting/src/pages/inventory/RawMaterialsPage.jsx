import ItemCatalog from '../../components/inventory/ItemCatalog'

export default function RawMaterialsPage() {
  return (
    <ItemCatalog
      category="raw_material"
      title="Raw Materials"
      description="Ingredients. On hand and average cost are computed from stock movements."
      emptyTitle="No raw materials yet"
      emptyDescription="Add an ingredient to start tracking stock."
    />
  )
}
