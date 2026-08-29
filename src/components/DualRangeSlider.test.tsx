// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { DualRangeSlider } from '~/components/DualRangeSlider'

/**
 * Both ends share one track, so the two things that can go wrong are the ends
 * crossing over each other and a sweep firing a navigation per pixel.
 */

afterEach(cleanup)

function setup(props: Partial<Parameters<typeof DualRangeSlider>[0]> = {}) {
  const onCommit = vi.fn()
  const onDrag = vi.fn()
  const view = render(
    <DualRangeSlider
      lowLabel="Shortest leg in hours"
      highLabel="Longest leg in hours"
      low={1}
      high={4}
      min={0}
      max={6}
      step={0.25}
      onDrag={onDrag}
      onCommit={onCommit}
      {...props}
    />,
  )
  const low = screen.getByLabelText('Shortest leg in hours') as HTMLInputElement
  const track = low.parentElement!
  // jsdom lays nothing out, so the track needs a width for a press to place.
  vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({ left: 0, width: 200 } as DOMRect)
  return {
    onCommit,
    onDrag,
    view,
    track,
    low,
    high: screen.getByLabelText('Longest leg in hours') as HTMLInputElement,
  }
}

describe('DualRangeSlider', () => {
  it('puts both ends on the track where it was told to', () => {
    const { low, high } = setup()
    expect(low.value).toBe('1')
    expect(high.value).toBe('4')
  })

  it('reports every movement so a readout can follow the thumb', () => {
    const { onDrag, low } = setup()
    fireEvent.change(low, { target: { value: '2' } })
    fireEvent.change(low, { target: { value: '2.5' } })
    expect(onDrag.mock.calls.flat()).toEqual([
      { low: 2, high: 4 },
      { low: 2.5, high: 4 },
    ])
  })

  it('holds the navigation until the drag ends', () => {
    const { onCommit, low } = setup()
    fireEvent.change(low, { target: { value: '2' } })
    fireEvent.change(low, { target: { value: '2.5' } })
    expect(onCommit).not.toHaveBeenCalled()

    fireEvent.pointerUp(low)
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ low: 2.5, high: 4 })
  })

  it('commits a keyboard adjustment when the key is released', () => {
    const { onCommit, high } = setup()
    fireEvent.change(high, { target: { value: '4.25' } })
    fireEvent.keyUp(high, { key: 'ArrowRight' })
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ low: 1, high: 4.25 })
  })

  it('lets the ends meet but never cross', () => {
    const { onDrag, onCommit, low } = setup()
    fireEvent.change(low, { target: { value: '5.5' } })
    expect(onDrag).toHaveBeenLastCalledWith({ low: 4, high: 4 })

    fireEvent.pointerUp(low)
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ low: 4, high: 4 })
  })

  it('stops the high end short of the low one as well', () => {
    const { onDrag, high } = setup()
    fireEvent.change(high, { target: { value: '0' } })
    expect(onDrag).toHaveBeenLastCalledWith({ low: 1, high: 1 })
  })

  it('says nothing when a press moves neither end', () => {
    const { onCommit, low } = setup()
    fireEvent.pointerUp(low)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('adopts a range changed elsewhere, such as by the number fields beside it', () => {
    const { view, low, high } = setup()
    view.rerender(
      <DualRangeSlider
        lowLabel="Shortest leg in hours"
        highLabel="Longest leg in hours"
        low={0.5}
        high={2}
        min={0}
        max={6}
        step={0.25}
        onCommit={vi.fn()}
      />,
    )
    expect(low.value).toBe('0.5')
    expect(high.value).toBe('2')
  })

  it('raises whichever thumb the press landed nearest', () => {
    const { low, high, track } = setup()
    // Between the ends, nearer the low one at 1 than the high one at 4.
    fireEvent.pointerDown(track, { clientX: 60 })
    expect(Number(low.style.zIndex)).toBeGreaterThan(Number(high.style.zIndex))

    fireEvent.pointerDown(track, { clientX: 140 })
    expect(Number(high.style.zIndex)).toBeGreaterThan(Number(low.style.zIndex))
  })

  it('lets a range whose ends have met be pulled apart again', () => {
    // Stacked thumbs are equally near every press, so the nearest-thumb rule
    // alone would always raise the low one and leave the range stuck shut.
    const { low, high, track } = setup({ low: 3, high: 3 })

    fireEvent.pointerDown(track, { clientX: 180 })
    expect(Number(high.style.zIndex)).toBeGreaterThan(Number(low.style.zIndex))

    fireEvent.pointerDown(track, { clientX: 20 })
    expect(Number(low.style.zIndex)).toBeGreaterThan(Number(high.style.zIndex))
  })
})
