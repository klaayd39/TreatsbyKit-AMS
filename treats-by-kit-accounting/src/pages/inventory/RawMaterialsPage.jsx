import ItemCatalog from '../../components/inventory/ItemCatalog'

export default function RawMaterialsPage() {
  return (
    <ItemCatalog
      category="raw_material"
      title="Ingredients"
      description="Flour, eggs, and the rest. In stock goes up when a supplier delivery is received."
      emptyTitle="No ingredients yet"
      emptyDescription="Add an ingredient before you write a recipe."
    />
  )
}
