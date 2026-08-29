// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { NumberField } from '~/components/NumberField'

/**
 * Every control writes through the URL, so a field that reported each keystroke
 * would navigate through "0" and "0." on the way to "0.5". These cover when a
 * value is allowed to escape the field, and what it has been rounded to when it
 * does.
 */

afterEach(cleanup)

function setup(props: Partial<Parameters<typeof NumberField>[0]> = {}) {
  const onCommit = vi.fn()
  render(
    <NumberField label="Cruise speed" value={110} step={5} min={40} max={400} onCommit={onCommit} {...props} />,
  )
  return { onCommit, input: screen.getByLabelText('Cruise speed') as HTMLInputElement }
}

/** The field as the planner actually uses it: the parent owns the value. */
function setupControlled(initial: number, step = 5) {
  const onCommit = vi.fn()
  function Harness() {
    const [value, setValue] = useState(initial)
    return (
      <NumberField
        label="Cruise speed"
        value={value}
        step={step}
        min={40}
        max={400}
        onCommit={(next) => {
          onCommit(next)
          setValue(next)
        }}
      />
    )
  }
  render(<Harness />)
  return { onCommit, input: screen.getByLabelText('Cruise speed') as HTMLInputElement }
}

describe('NumberField', () => {
  it('shows the value it was given', () => {
    expect(setup().input.value).toBe('110')
  })

  it('stays quiet while the value is still being typed', () => {
    const { onCommit, input } = setup()
    fireEvent.focus(input)
    for (const text of ['1', '13', '135']) fireEvent.change(input, { target: { value: text } })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('reports the value once on blur', () => {
    const { onCommit, input } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '135' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(135)
  })

  it('reports the value on Enter without waiting for focus to leave', () => {
    const { onCommit, input } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '135' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onCommit).toHaveBeenCalledExactlyOnceWith(135)
  })

  it('says nothing when the value has not actually changed', () => {
    const { onCommit, input } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '110' } })
    fireEvent.blur(input)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('puts the old value back on Escape', () => {
    const { onCommit, input } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '300' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input.value).toBe('110')
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('puts the old value back rather than committing something unreadable', () => {
    const { onCommit, input } = setup()
    for (const text of ['', '   ', 'abc']) {
      fireEvent.focus(input)
      fireEvent.change(input, { target: { value: text } })
      fireEvent.blur(input)
      expect(input.value).toBe('110')
    }
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('clamps a value typed outside the bounds', () => {
    const { onCommit, input } = setup()
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '9000' } })
    fireEvent.blur(input)
    expect(onCommit).toHaveBeenLastCalledWith(400)
    expect(input.value).toBe('400')
  })

  it('steps up and down with the arrow keys', () => {
    const { onCommit, input } = setupControlled(110)
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(onCommit.mock.calls.flat()).toEqual([115, 120, 115])
    expect(input.value).toBe('115')
  })

  it('snaps a stepped value onto the step grid', () => {
    const { onCommit, input } = setup({ value: 112 })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    // 112 + 5 rounded onto the grid of five, not 117.
    expect(onCommit).toHaveBeenLastCalledWith(115)
  })

  it('keeps a fractional step off floating-point dust', () => {
    const { onCommit, input } = setupControlled(110, 0.25)
    for (let i = 0; i < 6; i++) fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(onCommit).toHaveBeenLastCalledWith(111.5)
  })

  it('will not step past its bounds', () => {
    const { onCommit, input } = setup({ value: 400 })
    fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('adopts a value changed elsewhere, such as by back or forward', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <NumberField label="Cruise speed" value={110} step={5} onCommit={onCommit} />,
    )
    rerender(<NumberField label="Cruise speed" value={95} step={5} onCommit={onCommit} />)
    expect((screen.getByLabelText('Cruise speed') as HTMLInputElement).value).toBe('95')
  })

  it('does not overwrite what is being typed when the value changes underneath', () => {
    const onCommit = vi.fn()
    const { rerender } = render(
      <NumberField label="Cruise speed" value={110} step={5} onCommit={onCommit} />,
    )
    const input = screen.getByLabelText('Cruise speed') as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '13' } })
    rerender(<NumberField label="Cruise speed" value={95} step={5} onCommit={onCommit} />)
    expect(input.value).toBe('13')
  })
})
