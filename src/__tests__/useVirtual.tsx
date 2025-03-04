/* eslint-disable compat/compat, react/require-default-props */

import { useState } from "react";
import {
  render as tlRender,
  fireEvent,
  act,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { Align, Options, Return } from "../types";
import useVirtual from "../useVirtual";

type Props = Partial<Options> & {
  children: (obj: Return) => null;
  onRender?: () => null;
  onIsScrolling?: () => null;
  isDynamic?: boolean;
};

const Compo = ({
  children,
  isDynamic,
  itemCount = 10,
  onRender = () => null,
  onIsScrolling = () => null,
  ...options
}: Props) => {
  const [count, setCount] = useState(itemCount);
  const { outerRef, innerRef, items, ...rest } = useVirtual<
    HTMLDivElement,
    HTMLDivElement
  >({ itemCount: count, ...options });

  onRender();

  if (items[0]?.isScrolling) onIsScrolling();

  return (
    <div id="outer" ref={outerRef}>
      <div ref={innerRef}>
        {items.map(({ index, measureRef }) => (
          <div
            id={`${index}`}
            key={index}
            ref={isDynamic ? measureRef : undefined}
          >
            {index}
          </div>
        ))}
        {children({ outerRef, innerRef, items, ...rest })}
      </div>
      <button
        data-testid="set-item-count"
        type="button"
        // eslint-disable-next-line no-return-assign
        onClick={() => setCount((prevCount) => (prevCount -= 1))}
      >
        Set Count
      </button>
    </div>
  );
};

const render = (props?: Omit<Props, "children">) => {
  let obj: Return;

  tlRender(
    <Compo {...props}>
      {(o) => {
        obj = o;
        return null;
      }}
    </Compo>
  );

  // @ts-expect-error
  return { ...obj, getLatestItems: () => obj.items };
};

interface Callback {
  size?: number;
  cb: (size: number) => null;
}

type Args = Partial<{
  size: number;
  callbacks: Callback[];
}>;

const rect = { width: 300, height: 300 };

const createResizeObserver = ({ size = 50, callbacks }: Args = {}) =>
  jest.fn((cb) => ({
    observe: (el: HTMLDivElement) => {
      if (el.id === "outer") {
        cb([{ contentRect: rect }]);
      } else {
        const callback = (height: number) =>
          cb([{ target: { getBoundingClientRect: () => ({ height }) } }], {
            disconnect: () => null,
          });

        if (callbacks) {
          callback(callbacks[el.id as any]?.size || size);
          callbacks.push({ cb: callback });
        } else {
          callback(size);
        }
      }
    },
    disconnect: () => null,
  }));

describe("useVirtual", () => {
  jest.useFakeTimers();

  const item = {
    index: 0,
    start: 0,
    size: 50,
    width: rect.width,
    measureRef: expect.any(Function),
  };

  beforeEach(() => {
    // @ts-expect-error
    window.ResizeObserver = createResizeObserver();
  });

  describe("items", () => {
    it("should return correctly", () => {
      const { items } = render();
      const len = 7;
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 300 });
    });

    it("should return correctly while scrolling", () => {
      const { outerRef, getLatestItems } = render();

      fireEvent.scroll(outerRef.current, { target: { scrollTop: 50 } });
      let len = 8;
      let items = getLatestItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 350 });

      fireEvent.scroll(outerRef.current, { target: { scrollTop: 75 } });
      len = 9;
      items = getLatestItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 400 });

      fireEvent.scroll(outerRef.current, { target: { scrollTop: 200 } });
      len = 7;
      items = getLatestItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual({ ...item, index: 3 });
      expect(items[len - 1]).toEqual({ ...item, index: 9, start: 300 });
    });

    it("should return correctly with dynamic size", () => {
      // @ts-expect-error
      window.ResizeObserver = createResizeObserver({ size: 100 });
      const { items } = render({ isDynamic: true });
      const len = 4;
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual({ ...item, size: 100 });
      expect(items[len - 1]).toEqual({
        ...item,
        index: len - 1,
        size: 100,
        start: 300,
      });
    });

    it("should return correctly with real-time resize", () => {
      const callbacks: Callback[] = [];
      // @ts-expect-error
      window.ResizeObserver = createResizeObserver({ callbacks });
      const { getLatestItems } = render({ isDynamic: true });

      let size = 100;
      act(() => {
        callbacks[0].size = size;
        callbacks[0].cb(size);
      });
      let items = getLatestItems();
      let len = 6;
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual({ ...item, size });
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 300 });

      size = 200;
      act(() => {
        callbacks[0].size = size;
        callbacks[0].cb(size);
      });
      items = getLatestItems();
      len = 4;
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual({ ...item, size });
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 300 });
    });
  });

  describe("scrollTo", () => {
    it("should work correctly", () => {
      const { scrollTo, outerRef } = render();

      const cb = jest.fn();
      scrollTo(50, cb);
      expect(outerRef.current.scrollTop).toBe(50);
      expect(cb).toHaveBeenCalledTimes(1);

      scrollTo({ offset: 100 }, cb);
      expect(outerRef.current.scrollTop).toBe(100);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("should work with smooth scrolling correctly", () => {
      const { scrollTo, outerRef } = render();
      const cb = jest.fn();
      scrollTo({ offset: 50, smooth: true }, cb);
      jest.runAllTimers();
      expect(outerRef.current.scrollTop).toBe(50);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("scrollToItem", () => {
    it("should work correctly", () => {
      const { scrollToItem, outerRef } = render();

      const cb = jest.fn();
      scrollToItem(6, cb);
      expect(outerRef.current.scrollTop).toBe(50);
      expect(cb).toHaveBeenCalledTimes(1);

      scrollToItem({ index: 7 }, cb);
      expect(outerRef.current.scrollTop).toBe(100);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("should trigger callback only", () => {
      const { scrollToItem, outerRef } = render({ itemCount: 5 });
      const cb = jest.fn();
      scrollToItem(4, cb);
      expect(outerRef.current.scrollTop).toBe(0);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should work with smooth scrolling correctly", () => {
      const { scrollToItem, outerRef } = render();
      const cb = jest.fn();
      scrollToItem({ index: 6, smooth: true }, cb);
      jest.runAllTimers();
      expect(outerRef.current.scrollTop).toBe(50);
      expect(cb).toHaveBeenCalledTimes(1);
    });

    it("should work with alignment correctly", () => {
      const { scrollToItem, outerRef } = render({ itemCount: 18 });
      const { current: outer } = outerRef;

      scrollToItem(5);
      expect(outer.scrollTop).toBe(0);
      scrollToItem(11);
      expect(outer.scrollTop).toBe(300);
      scrollToItem(17);
      expect(outer.scrollTop).toBe(600);
      fireEvent.scroll(outer, { target: { scrollTop: 600 } });
      scrollToItem(15);
      expect(outer.scrollTop).toBe(600);
      scrollToItem(11);
      expect(outer.scrollTop).toBe(550);

      fireEvent.scroll(outer, { target: { scrollTop: 0 } });
      scrollToItem({ index: 1, align: Align.start });
      expect(outer.scrollTop).toBe(50);
      scrollToItem({ index: 11, align: Align.start });
      expect(outer.scrollTop).toBe(550);
      scrollToItem({ index: 17, align: Align.start });
      expect(outer.scrollTop).toBe(600);
      fireEvent.scroll(outer, { target: { scrollTop: 600 } });
      scrollToItem({ index: 15, align: Align.start });
      expect(outer.scrollTop).toBe(600);
      scrollToItem({ index: 11, align: Align.start });
      expect(outer.scrollTop).toBe(550);

      fireEvent.scroll(outer, { target: { scrollTop: 0 } });
      scrollToItem({ index: 5, align: Align.end });
      expect(outer.scrollTop).toBe(0);
      scrollToItem({ index: 6, align: Align.end });
      expect(outer.scrollTop).toBe(50);
      scrollToItem({ index: 11, align: Align.end });
      expect(outer.scrollTop).toBe(300);
      scrollToItem({ index: 17, align: Align.end });
      expect(outer.scrollTop).toBe(600);
      fireEvent.scroll(outer, { target: { scrollTop: 600 } });
      scrollToItem({ index: 15, align: Align.end });
      expect(outer.scrollTop).toBe(500);
      scrollToItem({ index: 11, align: Align.end });
      expect(outer.scrollTop).toBe(300);

      fireEvent.scroll(outer, { target: { scrollTop: 0 } });
      scrollToItem({ index: 2, align: Align.center });
      expect(outer.scrollTop).toBe(0);
      scrollToItem({ index: 3, align: Align.center });
      expect(outer.scrollTop).toBe(25);
      scrollToItem({ index: 11, align: Align.center });
      expect(outer.scrollTop).toBe(425);
      scrollToItem({ index: 14, align: Align.center });
      expect(outer.scrollTop).toBe(575);
      scrollToItem({ index: 15, align: Align.center });
      expect(outer.scrollTop).toBe(600);
      fireEvent.scroll(outer, { target: { scrollTop: 600 } });
      scrollToItem({ index: 11, align: Align.center });
      expect(outer.scrollTop).toBe(425);
    });

    it("should work with dynamic size correctly", () => {
      // @ts-expect-error
      window.ResizeObserver = createResizeObserver({ size: 100 });
      const { scrollToItem, outerRef } = render({ isDynamic: true });
      const { current: outer } = outerRef;

      const cb = jest.fn();
      scrollToItem(8, cb);
      expect(outer.scrollTop).toBe(500);
      expect(cb).not.toHaveBeenCalled();
      fireEvent.scroll(outer, { target: { scrollTop: 350 } });
      scrollToItem(8, cb);
      expect(outer.scrollTop).toBe(550);
      expect(cb).not.toHaveBeenCalled();
      fireEvent.scroll(outer, { target: { scrollTop: 550 } });
      scrollToItem(8, cb);
      expect(outer.scrollTop).toBe(600);
      expect(cb).not.toHaveBeenCalled();
      fireEvent.scroll(outer, { target: { scrollTop: 600 } });
      scrollToItem(8, cb);
      expect(outer.scrollTop).toBe(600);
      expect(cb).toHaveBeenCalledTimes(1);
    });
  });

  describe("horizontal", () => {
    it("should return `items` correctly", () => {
      const { getLatestItems, outerRef } = render({ horizontal: true });

      let len = 7;
      let items = getLatestItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 300 });

      fireEvent.scroll(outerRef.current, { target: { scrollLeft: 50 } });
      len = 8;
      items = getLatestItems();
      expect(items).toHaveLength(len);
      expect(items[0]).toEqual(item);
      expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 350 });
    });

    it("should scroll to offset correctly", () => {
      const { scrollTo, outerRef } = render({ horizontal: true });

      const cb = jest.fn();
      scrollTo(50, cb);
      expect(outerRef.current.scrollLeft).toBe(50);
      expect(cb).toHaveBeenCalledTimes(1);

      scrollTo({ offset: 100 }, cb);
      expect(outerRef.current.scrollLeft).toBe(100);
      expect(cb).toHaveBeenCalledTimes(2);
    });

    it("should scroll to item correctly", () => {
      const { scrollToItem, outerRef } = render({ horizontal: true });

      const cb = jest.fn();
      scrollToItem(6, cb);
      expect(outerRef.current.scrollLeft).toBe(50);
      expect(cb).toHaveBeenCalledTimes(1);

      scrollToItem({ index: 7 }, cb);
      expect(outerRef.current.scrollLeft).toBe(100);
      expect(cb).toHaveBeenCalledTimes(2);
    });
  });

  describe("resetScroll", () => {
    it("should not reset scroll position", () => {
      const { outerRef } = render();
      const scrollTop = 50;
      fireEvent.scroll(outerRef.current, { target: { scrollTop } });
      userEvent.click(screen.getByTestId("set-item-count"));
      expect(outerRef.current.scrollTop).toBe(scrollTop);
    });

    it("should reset scroll position", () => {
      const { outerRef } = render({ resetScroll: true });
      fireEvent.scroll(outerRef.current, { target: { scrollTop: 50 } });
      userEvent.click(screen.getByTestId("set-item-count"));
      expect(outerRef.current.scrollTop).toBe(0);
    });
  });

  describe("onScroll", () => {
    const e = {
      overscanStartIndex: 0,
      overscanStopIndex: 7,
      visibleStartIndex: 1,
      visibleStopIndex: 6,
      scrollForward: true,
      scrollOffset: 50,
      userScroll: true,
    };

    it("should work with use scroll correctly", () => {
      const onScroll = jest.fn();
      const { outerRef } = render({ onScroll });
      fireEvent.scroll(outerRef.current, { target: { scrollTop: 50 } });
      expect(onScroll).toHaveBeenCalledWith(e);
    });

    it("should work with imperatively scroll correctly", () => {
      const onScroll = jest.fn();
      const { outerRef, scrollTo } = render({ onScroll });
      scrollTo(50);
      fireEvent.scroll(outerRef.current, { target: { scrollTop: 50 } });
      expect(onScroll).toHaveBeenCalledWith({ ...e, userScroll: false });
    });

    it("should work with scroll backward correctly", () => {
      const onScroll = jest.fn();
      const { outerRef } = render({ onScroll });
      fireEvent.scroll(outerRef.current, { target: { scrollTop: 100 } });
      fireEvent.scroll(outerRef.current, { target: { scrollTop: 50 } });
      expect(onScroll).toHaveBeenCalledWith({ ...e, scrollForward: false });
    });
  });

  it.each([100, (i: number) => 100 - i + i, (_: number, w: number) => w - 200])(
    "should return `items` correctly with specified `itemSize`",
    (itemSize) => {
      const { items } = render({ itemSize });
      const len = 4;
      expect(items).toHaveLength(len);
      expect(items[0].size).toBe(100);
      expect(items[len - 1].size).toBe(100);
    }
  );

  it("should return `items` correctly with specified `overscanCount`", () => {
    let { items } = render({ overscanCount: 0 });
    let len = 6;
    expect(items).toHaveLength(len);
    expect(items[0]).toEqual(item);
    expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 250 });

    items = render({ overscanCount: 2 }).items;
    len = 8;
    expect(items).toHaveLength(len);
    expect(items[0]).toEqual(item);
    expect(items[len - 1]).toEqual({ ...item, index: len - 1, start: 350 });
  });

  it("should return `items` correctly with `useIsScrolling`", () => {
    const onIsScrolling = jest.fn();
    const { outerRef } = render({ useIsScrolling: true, onIsScrolling });
    fireEvent.scroll(outerRef.current, { target: { scrollTop: 50 } });
    expect(onIsScrolling).toHaveBeenCalled();
  });

  it.each([500, (t: number) => t * 10])(
    "should scroll to offset with specified `scrollDuration`",
    (scrollDuration) => {
      const { scrollTo, outerRef } = render({ scrollDuration });
      const cb = jest.fn();
      scrollTo({ offset: 50, smooth: true }, cb);
      jest.advanceTimersByTime(512);
      expect(outerRef.current.scrollTop).toBe(50);
      expect(cb).toHaveBeenCalledTimes(1);
    }
  );

  it("should scroll to offset with specified `scrollEasingFunction`", () => {
    const { scrollTo, outerRef } = render({ scrollEasingFunction: (t) => t });
    const cb = jest.fn();
    scrollTo({ offset: 50, smooth: true }, cb);
    jest.runAllTimers();
    expect(outerRef.current.scrollTop).toBe(50);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("should trigger re-rendering correctly", () => {
    const onRender = jest.fn();
    const { current: outer } = render({ onRender }).outerRef;
    expect(onRender).toHaveBeenCalledTimes(2);

    fireEvent.scroll(outer, { target: { scrollTop: 25 } });
    fireEvent.scroll(outer, { target: { scrollTop: 30 } });
    expect(onRender).toHaveBeenCalledTimes(4);

    fireEvent.scroll(outer, { target: { scrollTop: 25 } });
    expect(onRender).toHaveBeenCalledTimes(4);

    fireEvent.scroll(outer, { target: { scrollTop: 75 } });
    expect(onRender).toHaveBeenCalledTimes(5);
  });
});
