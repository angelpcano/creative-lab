export function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string
  value: number
  min?: number
  max?: number
  step?: number
  onChange: (value: number) => void
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={Number.isFinite(value) ? value : 0}
        onChange={(event) => {
          const nextValue = Number(event.currentTarget.value)
          if (Number.isFinite(nextValue)) onChange(nextValue)
        }}
      />
    </label>
  )
}

export function ColorField({
  id,
  value,
  onChange,
}: {
  id: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div className="color-control">
      <input
        id={id}
        type="color"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
      <span>{value.toUpperCase()}</span>
    </div>
  )
}
