/*
 * Minimal Preact-compatible React-Redux bindings
 */

import { createContext } from 'preact';
import {
  useContext, useEffect, useRef, useState,
} from 'preact/hooks';

const ReduxContext = createContext(null);

export function shallowEqual(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || a === null
    || typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!Object.is(a[i], b[i])) return false;
    }
    return true;
  }
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  for (let i = 0; i < keysA.length; i += 1) {
    const key = keysA[i];
    if (!Object.prototype.hasOwnProperty.call(b, key)
      || !Object.is(a[key], b[key])) {
      return false;
    }
  }
  return true;
}

export const Provider = ({ store, children }) => (
  <ReduxContext.Provider value={store}>
    {children}
  </ReduxContext.Provider>
);

export function useDispatch() {
  const store = useContext(ReduxContext);
  if (!store) {
    throw new Error('useDispatch must be used inside a Redux Provider');
  }
  return store.dispatch;
}

export function useSelector(selector, equalityFn = Object.is) {
  const store = useContext(ReduxContext);
  if (!store) {
    throw new Error('useSelector must be used inside a Redux Provider');
  }
  const selectorRef = useRef(selector);
  const equalityRef = useRef(equalityFn);

  const [selected, setSelected] = useState(() => selector(store.getState()));
  const selectedRef = useRef(selected);

  useEffect(() => {
    selectorRef.current = selector;
    equalityRef.current = equalityFn;
    selectedRef.current = selected;
  }, [selector, equalityFn, selected]);

  useEffect(() => {
    const check = () => {
      const next = selectorRef.current(store.getState());
      if (!equalityRef.current(selectedRef.current, next)) {
        selectedRef.current = next;
        setSelected(next);
      }
    };
    check();
    return store.subscribe(check);
  }, [store]);

  return selected;
}
