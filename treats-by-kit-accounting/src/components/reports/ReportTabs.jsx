import Button from '../ui/Button'

export default function ReportTabs({ tabs, value, onChange }) {
  return (
    <div className="no-print mb-4 flex gap-2 overflow-x-auto pb-1">
      {tabs.map((tab) => (
        <Button key={tab.id} variant={value === tab.id ? 'primary' : 'secondary'} onClick={() => onChange(tab.id)}>
          {tab.label}
        </Button>
      ))}
    </div>
  )
}
