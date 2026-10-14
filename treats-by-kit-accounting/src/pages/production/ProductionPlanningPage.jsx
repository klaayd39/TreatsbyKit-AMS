import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../../components/ui/Button'
import { buttonClass } from '../../components/ui/buttonStyles'
import Card from '../../components/ui/Card'
import DataTable from '../../components/ui/DataTable'
import EmptyState from '../../components/ui/EmptyState'
import Field, { controlClass } from '../../components/ui/Field'
import PageHeader from '../../components/ui/PageHeader'
import { COLLECTIONS } from '../../data/seed'
import { getAll } from '../../data/storage'
import { formatCurrency, formatQuantity, todayISODate } from '../../utils/format'
import { getAverageCost, getStockOnHand, roundQuantity } from '../../utils/inventory'
import { scaleRecipe } from '../../utils/production'

export default function ProductionPlanningPage() {
  const navigate = useNavigate()
  const [recipeId, setRecipeId] = useState('')
  const [quantity, setQuantity] = useState('1')

  const recipes = getAll(COLLECTIONS.RECIPES).sort((a, b) => a.name.localeCompare(b.name))
  const items = getAll(COLLECTIONS.ITEMS)
  const movements = getAll(COLLECTIONS.STOCK_MOVEMENTS)
  const recipe = recipes.find((entry) => entry.id === recipeId)
  const target = Number(quantity)
  const quantityValid = Number.isFinite(target) && target > 0
  const itemName = (itemId) => items.find((item) => item.id === itemId)?.name || 'Unknown item'
  const itemUnit = (itemId) => items.find((item) => item.id === itemId)?.unit || ''

  const rows = recipe && quantityValid
    ? scaleRecipe(recipe, target).map((line) => {
        const average = getAverageCost(line.itemId, movements)
        const onHand = getStockOnHand(line.itemId, movements)
        const shortfall = roundQuantity(Math.max(0, line.expectedQty - onHand))
        return {
          ...line,
          name: itemName(line.itemId),
          unit: itemUnit(line.itemId),
          onHand,
          shortfall,
          average,
          lineCost: line.expectedQty * (average || 0),
        }
      })
    : []
  const totalCost = rows.reduce((sum, row) => sum + row.lineCost, 0)
  const costPerUnit = quantityValid ? totalCost / target : 0
  const missingCost = rows.some((row) => row.average === null)

  function createBatch() {
    navigate('/production/batches', {
      state: { recipeId, quantity: target, date: todayISODate() },
    })
  }

  if (recipes.length === 0) {
    return (
      <>
        <PageHeader
          title="Production Planning"
          description="See what a batch would need. Planning does not change stock."
        />
        <EmptyState
          title="No recipes yet"
          description="Add a product recipe before planning a batch."
          action={
            <Link to="/production/recipes" className={buttonClass()}>
              Add a recipe
            </Link>
          }
        />
      </>
    )
  }

  return (
    <>
      <PageHeader
        title="Production Planning"
        description="See what a batch would need. Planning does not change stock and is not saved."
      />
      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <Field label="Recipe" htmlFor="plan-recipe">
          <select
            id="plan-recipe"
            className={controlClass}
            value={recipeId}
            onChange={(event) => setRecipeId(event.target.value)}
          >
            <option value="">Select a recipe</option>
            {recipes.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Target quantity" htmlFor="plan-quantity" error={quantity !== '' && !quantityValid ? 'Enter a quantity greater than 0.' : ''}>
          <input
            id="plan-quantity"
            className={controlClass}
            inputMode="decimal"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
          />
        </Field>
      </div>

      {!recipe ? (
        <EmptyState title="Choose a recipe" description="The requirements table appears here." />
      ) : !quantityValid ? null : (
        <>
          <DataTable>
            <thead className="bg-sand/50">
              <tr>
                <th scope="col">Ingredient</th>
                <th scope="col" className="text-right">Needed</th>
                <th scope="col" className="text-right">On hand</th>
                <th scope="col" className="text-right">Shortage</th>
                <th scope="col" className="text-right">Est. cost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const short = row.shortfall > 0
                return (
                  <tr key={row.itemId} className={short ? 'bg-red-50' : 'bg-emerald-50'}>
                    <td>
                      {row.name} <span className="text-muted">{row.unit}</span>
                    </td>
                    <td className="text-right tabular-nums">{formatQuantity(row.expectedQty)}</td>
                    <td className="text-right tabular-nums">{formatQuantity(row.onHand)}</td>
                    <td className={`text-right tabular-nums ${short ? 'font-medium text-red-800' : 'text-emerald-800'}`}>
                      {short ? formatQuantity(row.shortfall) : '0'}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.average === null ? '—' : formatCurrency(row.lineCost)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </DataTable>
          {missingCost ? (
            <p className="mt-3 text-sm text-muted">Ingredients without a purchase cost are counted as ₱0.00.</p>
          ) : null}
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Card title="Estimated batch cost" value={formatCurrency(totalCost)} />
            <Card title="Estimated cost per unit" value={formatCurrency(costPerUnit)} />
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={createBatch}>Create batch from this plan</Button>
          </div>
        </>
      )}
    </>
  )
}
