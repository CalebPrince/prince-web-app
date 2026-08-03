(function (global) {
  'use strict';
  class EventEmitter {
    constructor() { this._events = Object.create(null); }
    on(name, listener) { (this._events[name] ||= []).push(listener); return this; }
    addListener(name, listener) { return this.on(name, listener); }
    once(name, listener) {
      const wrapped = (...args) => { this.off(name, wrapped); listener.apply(this, args); };
      wrapped.listener = listener;
      return this.on(name, wrapped);
    }
    off(name, listener) {
      const list = this._events[name];
      if (list) this._events[name] = list.filter((item) => item !== listener && item.listener !== listener);
      return this;
    }
    removeListener(name, listener) { return this.off(name, listener); }
    removeAllListeners(name) { if (name === undefined) this._events = Object.create(null); else delete this._events[name]; return this; }
    emit(name, ...args) { for (const listener of [...(this._events[name] || [])]) listener.apply(this, args); return Boolean(this._events[name]?.length); }
    listeners(name) { return [...(this._events[name] || [])]; }
    listenerCount(name) { return (this._events[name] || []).length; }
  }
  global.events$1 = { EventEmitter };
})(globalThis);
