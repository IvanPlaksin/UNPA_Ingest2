import { jsxs as $, jsx as E, Fragment as ao } from "react/jsx-runtime";
import Be, { createContext as lo, useContext as uo, useMemo as Ft, useRef as ae, useCallback as De, useState as he, useEffect as be, createElement as co } from "react";
const M = (e) => typeof e == "string", ct = () => {
  let e, t;
  const n = new Promise((r, i) => {
    e = r, t = i;
  });
  return n.resolve = e, n.reject = t, n;
}, pr = (e) => e == null ? "" : String(e), fo = (e, t, n) => {
  e.forEach((r) => {
    t[r] && (n[r] = t[r]);
  });
}, ho = /###/g, dr = (e) => e && e.includes("###") ? e.replace(ho, ".") : e, gr = (e) => !e || M(e), mt = (e, t, n) => {
  const r = M(t) ? t.split(".") : t;
  let i = 0;
  for (; i < r.length - 1; ) {
    if (gr(e)) return {};
    const s = dr(r[i]);
    !e[s] && n && (e[s] = new n()), Object.prototype.hasOwnProperty.call(e, s) ? e = e[s] : e = {}, ++i;
  }
  return gr(e) ? {} : {
    obj: e,
    k: dr(r[i])
  };
}, mr = (e, t, n) => {
  const {
    obj: r,
    k: i
  } = mt(e, t, Object);
  if (r !== void 0 || t.length === 1) {
    r[i] = n;
    return;
  }
  let s = t[t.length - 1], o = t.slice(0, t.length - 1), a = mt(e, o, Object);
  for (; a.obj === void 0 && o.length; )
    s = `${o[o.length - 1]}.${s}`, o = o.slice(0, o.length - 1), a = mt(e, o, Object), a?.obj && typeof a.obj[`${a.k}.${s}`] < "u" && (a.obj = void 0);
  a.obj[`${a.k}.${s}`] = n;
}, po = (e, t, n, r) => {
  const {
    obj: i,
    k: s
  } = mt(e, t, Object);
  i[s] = i[s] || [], i[s].push(n);
}, $t = (e, t) => {
  const {
    obj: n,
    k: r
  } = mt(e, t);
  if (n && Object.prototype.hasOwnProperty.call(n, r))
    return n[r];
}, go = (e, t, n) => {
  const r = $t(e, n);
  return r !== void 0 ? r : $t(t, n);
}, Pi = (e, t, n) => {
  for (const r in t)
    r !== "__proto__" && r !== "constructor" && (Object.prototype.hasOwnProperty.call(e, r) ? M(e[r]) || e[r] instanceof String || M(t[r]) || t[r] instanceof String ? n && (e[r] = t[r]) : Pi(e[r], t[r], n) : e[r] = t[r]);
  return e;
}, Le = (e) => e.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), mo = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;"
}, yo = (e) => M(e) ? e.replace(/[&<>"'\/]/g, (t) => mo[t]) : e;
class bo {
  constructor(t) {
    this.capacity = t, this.regExpMap = /* @__PURE__ */ new Map(), this.regExpQueue = [];
  }
  getRegExp(t) {
    const n = this.regExpMap.get(t);
    if (n !== void 0)
      return n;
    const r = new RegExp(t);
    return this.regExpQueue.length === this.capacity && this.regExpMap.delete(this.regExpQueue.shift()), this.regExpMap.set(t, r), this.regExpQueue.push(t), r;
  }
}
const xo = [" ", ",", "?", "!", ";"], ko = new bo(20), wo = (e, t, n) => {
  t = t || "", n = n || "";
  const r = xo.filter((o) => !t.includes(o) && !n.includes(o));
  if (r.length === 0) return !0;
  const i = ko.getRegExp(`(${r.map((o) => o === "?" ? "\\?" : o).join("|")})`);
  let s = !i.test(e);
  if (!s) {
    const o = e.indexOf(n);
    o > 0 && !i.test(e.substring(0, o)) && (s = !0);
  }
  return s;
}, In = (e, t, n = ".") => {
  if (!e) return;
  if (e[t])
    return Object.prototype.hasOwnProperty.call(e, t) ? e[t] : void 0;
  const r = t.split(n);
  let i = e;
  for (let s = 0; s < r.length; ) {
    if (!i || typeof i != "object")
      return;
    let o, a = "";
    for (let u = s; u < r.length; ++u)
      if (u !== s && (a += n), a += r[u], o = i[a], o !== void 0) {
        if (["string", "number", "boolean"].includes(typeof o) && u < r.length - 1)
          continue;
        s += u - s + 1;
        break;
      }
    i = o;
  }
  return i;
}, St = (e) => e?.replace(/_/g, "-"), So = {
  type: "logger",
  log(e) {
    this.output("log", e);
  },
  warn(e) {
    this.output("warn", e);
  },
  error(e) {
    this.output("error", e);
  },
  output(e, t) {
    console?.[e]?.apply?.(console, t);
  }
};
class Bt {
  constructor(t, n = {}) {
    this.init(t, n);
  }
  init(t, n = {}) {
    this.prefix = n.prefix || "i18next:", this.logger = t || So, this.options = n, this.debug = n.debug;
  }
  log(...t) {
    return this.forward(t, "log", "", !0);
  }
  warn(...t) {
    return this.forward(t, "warn", "", !0);
  }
  error(...t) {
    return this.forward(t, "error", "");
  }
  deprecate(...t) {
    return this.forward(t, "warn", "WARNING DEPRECATED: ", !0);
  }
  forward(t, n, r, i) {
    return i && !this.debug ? null : (t = t.map((s) => M(s) ? s.replace(/[\r\n\x00-\x1F\x7F]/g, " ") : s), M(t[0]) && (t[0] = `${r}${this.prefix} ${t[0]}`), this.logger[n](t));
  }
  create(t) {
    return new Bt(this.logger, {
      prefix: `${this.prefix}:${t}:`,
      ...this.options
    });
  }
  clone(t) {
    return t = t || this.options, t.prefix = t.prefix || this.prefix, new Bt(this.logger, t);
  }
}
var ve = new Bt();
class Wt {
  constructor() {
    this.observers = {};
  }
  on(t, n) {
    return t.split(" ").forEach((r) => {
      this.observers[r] || (this.observers[r] = /* @__PURE__ */ new Map());
      const i = this.observers[r].get(n) || 0;
      this.observers[r].set(n, i + 1);
    }), this;
  }
  off(t, n) {
    if (this.observers[t]) {
      if (!n) {
        delete this.observers[t];
        return;
      }
      this.observers[t].delete(n);
    }
  }
  once(t, n) {
    const r = (...i) => {
      n(...i), this.off(t, r);
    };
    return this.on(t, r), this;
  }
  emit(t, ...n) {
    this.observers[t] && Array.from(this.observers[t].entries()).forEach(([i, s]) => {
      for (let o = 0; o < s; o++)
        i(...n);
    }), this.observers["*"] && Array.from(this.observers["*"].entries()).forEach(([i, s]) => {
      for (let o = 0; o < s; o++)
        i(t, ...n);
    });
  }
}
class yr extends Wt {
  constructor(t, n = {
    ns: ["translation"],
    defaultNS: "translation"
  }) {
    super(), this.data = t || {}, this.options = n, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.options.ignoreJSONStructure === void 0 && (this.options.ignoreJSONStructure = !0);
  }
  addNamespaces(t) {
    this.options.ns.includes(t) || this.options.ns.push(t);
  }
  removeNamespaces(t) {
    const n = this.options.ns.indexOf(t);
    n > -1 && this.options.ns.splice(n, 1);
  }
  getResource(t, n, r, i = {}) {
    const s = i.keySeparator !== void 0 ? i.keySeparator : this.options.keySeparator, o = i.ignoreJSONStructure !== void 0 ? i.ignoreJSONStructure : this.options.ignoreJSONStructure;
    let a;
    t.includes(".") ? a = t.split(".") : (a = [t, n], r && (Array.isArray(r) ? a.push(...r) : M(r) && s ? a.push(...r.split(s)) : a.push(r)));
    const u = $t(this.data, a);
    return !u && !n && !r && t.includes(".") && (t = a[0], n = a[1], r = a.slice(2).join(".")), u || !o || !M(r) ? u : In(this.data?.[t]?.[n], r, s);
  }
  addResource(t, n, r, i, s = {
    silent: !1
  }) {
    const o = s.keySeparator !== void 0 ? s.keySeparator : this.options.keySeparator;
    let a = [t, n];
    r && (a = a.concat(o ? r.split(o) : r)), t.includes(".") && (a = t.split("."), i = n, n = a[1]), this.addNamespaces(n), mr(this.data, a, i), s.silent || this.emit("added", t, n, r, i);
  }
  addResources(t, n, r, i = {
    silent: !1
  }) {
    for (const s in r)
      (M(r[s]) || Array.isArray(r[s])) && this.addResource(t, n, s, r[s], {
        silent: !0
      });
    i.silent || this.emit("added", t, n, r);
  }
  addResourceBundle(t, n, r, i, s, o = {
    silent: !1,
    skipCopy: !1
  }) {
    let a = [t, n];
    t.includes(".") && (a = t.split("."), i = r, r = n, n = a[1]), this.addNamespaces(n);
    let u = $t(this.data, a) || {};
    o.skipCopy || (r = JSON.parse(JSON.stringify(r))), i ? Pi(u, r, s) : u = {
      ...u,
      ...r
    }, mr(this.data, a, u), o.silent || this.emit("added", t, n, r);
  }
  removeResourceBundle(t, n) {
    this.hasResourceBundle(t, n) && delete this.data[t][n], this.removeNamespaces(n), this.emit("removed", t, n);
  }
  hasResourceBundle(t, n) {
    return this.getResource(t, n) !== void 0;
  }
  getResourceBundle(t, n) {
    return n || (n = this.options.defaultNS), this.getResource(t, n);
  }
  getDataByLanguage(t) {
    return this.data[t];
  }
  hasLanguageSomeTranslations(t) {
    const n = this.getDataByLanguage(t);
    return !!(n && Object.keys(n) || []).find((i) => n[i] && Object.keys(n[i]).length > 0);
  }
  toJSON() {
    return this.data;
  }
}
var Di = {
  processors: {},
  addPostProcessor(e) {
    this.processors[e.name] = e;
  },
  handle(e, t, n, r, i) {
    return e.forEach((s) => {
      t = this.processors[s]?.process(t, n, r, i) ?? t;
    }), t;
  }
};
const _i = /* @__PURE__ */ Symbol("i18next/PATH_KEY");
function vo() {
  const e = [], t = /* @__PURE__ */ Object.create(null);
  let n;
  return t.get = (r, i) => (n?.revoke?.(), i === _i ? e : (e.push(i), n = Proxy.revocable(r, t), n.proxy)), Proxy.revocable(/* @__PURE__ */ Object.create(null), t).proxy;
}
function tt(e, t) {
  const {
    [_i]: n
  } = e(vo()), r = t?.keySeparator ?? ".", i = t?.nsSeparator ?? ":", s = t?.enableSelector === "strict";
  if (n.length > 1 && i) {
    const o = t?.ns, a = s ? Array.isArray(o) ? o : o ? [o] : null : Array.isArray(o) ? o : null;
    if (a && (s ? a : a.length > 1 ? a.slice(1) : []).includes(n[0]))
      return `${n[0]}${i}${n.slice(1).join(r)}`;
  }
  return n.join(r);
}
const Zt = (e) => !M(e) && typeof e != "boolean" && typeof e != "number";
class Ut extends Wt {
  constructor(t, n = {}) {
    super(), fo(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], t, this), this.options = n, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.logger = ve.create("translator"), this.checkedLoadedFor = {};
  }
  changeLanguage(t) {
    t && (this.language = t);
  }
  exists(t, n = {
    interpolation: {}
  }) {
    const r = {
      ...n
    };
    if (t == null) return !1;
    const i = this.resolve(t, r);
    if (i?.res === void 0) return !1;
    const s = Zt(i.res);
    return !(r.returnObjects === !1 && s);
  }
  extractFromKey(t, n) {
    let r = n.nsSeparator !== void 0 ? n.nsSeparator : this.options.nsSeparator;
    r === void 0 && (r = ":");
    const i = n.keySeparator !== void 0 ? n.keySeparator : this.options.keySeparator;
    let s = n.ns || this.options.defaultNS || [];
    const o = r && t.includes(r), a = !this.options.userDefinedKeySeparator && !n.keySeparator && !this.options.userDefinedNsSeparator && !n.nsSeparator && !wo(t, r, i);
    if (o && !a) {
      const u = t.match(this.interpolator.nestingRegexp);
      if (u && u.length > 0)
        return {
          key: t,
          namespaces: M(s) ? [s] : s
        };
      const l = t.split(r);
      (r !== i || r === i && this.options.ns.includes(l[0])) && (s = l.shift()), t = l.join(i);
    }
    return {
      key: t,
      namespaces: M(s) ? [s] : s
    };
  }
  translate(t, n, r) {
    let i = typeof n == "object" ? {
      ...n
    } : n;
    if (typeof i != "object" && this.options.overloadTranslationOptionHandler && (i = this.options.overloadTranslationOptionHandler(arguments)), typeof i == "object" && (i = {
      ...i
    }), i || (i = {}), t == null) return "";
    typeof t == "function" && (t = tt(t, {
      ...this.options,
      ...i
    })), Array.isArray(t) || (t = [String(t)]), t = t.map((_) => typeof _ == "function" ? tt(_, {
      ...this.options,
      ...i
    }) : String(_));
    const s = i.returnDetails !== void 0 ? i.returnDetails : this.options.returnDetails, o = i.keySeparator !== void 0 ? i.keySeparator : this.options.keySeparator, {
      key: a,
      namespaces: u
    } = this.extractFromKey(t[t.length - 1], i), l = u[u.length - 1];
    let f = i.nsSeparator !== void 0 ? i.nsSeparator : this.options.nsSeparator;
    f === void 0 && (f = ":");
    const c = i.lng || this.language, p = i.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
    if (c?.toLowerCase() === "cimode")
      return p ? s ? {
        res: `${l}${f}${a}`,
        usedKey: a,
        exactUsedKey: a,
        usedLng: c,
        usedNS: l,
        usedParams: this.getUsedParamsDetails(i)
      } : `${l}${f}${a}` : s ? {
        res: a,
        usedKey: a,
        exactUsedKey: a,
        usedLng: c,
        usedNS: l,
        usedParams: this.getUsedParamsDetails(i)
      } : a;
    const h = this.resolve(t, i);
    let d = h?.res;
    const y = h?.usedKey || a, x = h?.exactUsedKey || a, b = ["[object Number]", "[object Function]", "[object RegExp]"], v = i.joinArrays !== void 0 ? i.joinArrays : this.options.joinArrays, w = !this.i18nFormat || this.i18nFormat.handleAsObject, I = i.count !== void 0 && !M(i.count), O = Ut.hasDefaultValue(i), S = I ? this.pluralResolver.getSuffix(c, i.count, i) : "", z = i.ordinal && I ? this.pluralResolver.getSuffix(c, i.count, {
      ordinal: !1
    }) : "", V = I && !i.ordinal && i.count === 0, D = V && i[`defaultValue${this.options.pluralSeparator}zero`] || i[`defaultValue${S}`] || i[`defaultValue${z}`] || i.defaultValue;
    let k = d;
    w && !d && O && (k = D);
    const L = Zt(k), R = Object.prototype.toString.apply(k);
    if (w && k && L && !b.includes(R) && !(M(v) && Array.isArray(k))) {
      if (!i.returnObjects && !this.options.returnObjects) {
        this.options.returnedObjectHandler || this.logger.warn("accessing an object - but returnObjects options is not enabled!");
        const _ = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(y, k, {
          ...i,
          ns: u
        }) : `key '${a} (${this.language})' returned an object instead of string.`;
        return s ? (h.res = _, h.usedParams = this.getUsedParamsDetails(i), h) : _;
      }
      if (o) {
        const _ = Array.isArray(k), P = _ ? [] : {}, A = _ ? x : y;
        for (const U in k)
          if (Object.prototype.hasOwnProperty.call(k, U)) {
            const W = `${A}${o}${U}`;
            O && !d ? P[U] = this.translate(W, {
              ...i,
              defaultValue: Zt(D) ? D[U] : void 0,
              joinArrays: !1,
              ns: u
            }) : P[U] = this.translate(W, {
              ...i,
              joinArrays: !1,
              ns: u
            }), P[U] === W && (P[U] = k[U]);
          }
        d = P;
      }
    } else if (w && M(v) && Array.isArray(d))
      d = d.join(v), d && (d = this.extendTranslation(d, t, i, r));
    else {
      let _ = !1, P = !1;
      !this.isValidLookup(d) && O && (_ = !0, d = D), this.isValidLookup(d) || (P = !0, d = a);
      const U = (i.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey) && P ? void 0 : d, W = O && D !== d && this.options.updateMissing;
      if (P || _ || W) {
        if (this.logger.log(W ? "updateKey" : "missingKey", c, l, I && !W ? `${a}${this.pluralResolver.getSuffix(c, i.count, i)}` : a, W ? D : d), o) {
          const Q = this.resolve(a, {
            ...i,
            keySeparator: !1
          });
          Q && Q.res && this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
        }
        let te = [];
        const ue = this.languageUtils.getFallbackCodes(this.options.fallbackLng, i.lng || this.language);
        if (this.options.saveMissingTo === "fallback" && ue && ue[0])
          for (let Q = 0; Q < ue.length; Q++)
            te.push(ue[Q]);
        else this.options.saveMissingTo === "all" ? te = this.languageUtils.toResolveHierarchy(i.lng || this.language) : te.push(i.lng || this.language);
        const g = (Q, ne, m) => {
          const ce = O && m !== d ? m : U;
          this.options.missingKeyHandler ? this.options.missingKeyHandler(Q, l, ne, ce, W, i) : this.backendConnector?.saveMissing && this.backendConnector.saveMissing(Q, l, ne, ce, W, i), this.emit("missingKey", Q, l, ne, d);
        };
        this.options.saveMissing && (this.options.saveMissingPlurals && I ? te.forEach((Q) => {
          const ne = this.pluralResolver.getSuffixes(Q, i);
          V && i[`defaultValue${this.options.pluralSeparator}zero`] && !ne.includes(`${this.options.pluralSeparator}zero`) && ne.push(`${this.options.pluralSeparator}zero`), ne.forEach((m) => {
            g([Q], a + m, i[`defaultValue${m}`] || D);
          });
        }) : g(te, a, D));
      }
      d = this.extendTranslation(d, t, i, h, r), P && d === a && this.options.appendNamespaceToMissingKey && (d = `${l}${f}${a}`), (P || _) && this.options.parseMissingKeyHandler && (d = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${l}${f}${a}` : a, _ ? d : void 0, i));
    }
    return s ? (h.res = d, h.usedParams = this.getUsedParamsDetails(i), h) : d;
  }
  extendTranslation(t, n, r, i, s) {
    if (this.i18nFormat?.parse)
      t = this.i18nFormat.parse(t, {
        ...this.options.interpolation.defaultVariables,
        ...r
      }, r.lng || this.language || i.usedLng, i.usedNS, i.usedKey, {
        resolved: i
      });
    else if (!r.skipInterpolation) {
      r.interpolation && this.interpolator.init({
        ...r,
        interpolation: {
          ...this.options.interpolation,
          ...r.interpolation
        }
      });
      const u = M(t) && (r?.interpolation?.skipOnVariables !== void 0 ? r.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
      let l;
      if (u) {
        const c = t.match(this.interpolator.nestingRegexp);
        l = c && c.length;
      }
      let f = r.replace && !M(r.replace) ? r.replace : r;
      if (this.options.interpolation.defaultVariables && (f = {
        ...this.options.interpolation.defaultVariables,
        ...f
      }), t = this.interpolator.interpolate(t, f, r.lng || this.language || i.usedLng, r), u) {
        const c = t.match(this.interpolator.nestingRegexp), p = c && c.length;
        l < p && (r.nest = !1);
      }
      !r.lng && i && i.res && (r.lng = this.language || i.usedLng), r.nest !== !1 && (t = this.interpolator.nest(t, (...c) => s?.[0] === c[0] && !r.context ? (this.logger.warn(`It seems you are nesting recursively key: ${c[0]} in key: ${n[0]}`), null) : this.translate(...c, n), r)), r.interpolation && this.interpolator.reset();
    }
    const o = r.postProcess || this.options.postProcess, a = M(o) ? [o] : o;
    return t != null && a?.length && r.applyPostProcessor !== !1 && (t = Di.handle(a, t, n, this.options && this.options.postProcessPassResolved ? {
      i18nResolved: {
        ...i,
        usedParams: this.getUsedParamsDetails(r)
      },
      ...r
    } : r, this)), t;
  }
  resolve(t, n = {}) {
    let r, i, s, o, a;
    return M(t) && (t = [t]), Array.isArray(t) && (t = t.map((u) => typeof u == "function" ? tt(u, {
      ...this.options,
      ...n
    }) : u)), t.forEach((u) => {
      if (this.isValidLookup(r)) return;
      const l = this.extractFromKey(u, n), f = l.key;
      i = f;
      let c = l.namespaces;
      this.options.fallbackNS && (c = c.concat(this.options.fallbackNS));
      const p = n.count !== void 0 && !M(n.count), h = p && !n.ordinal && n.count === 0, d = n.context !== void 0 && (M(n.context) || typeof n.context == "number") && n.context !== "", y = n.lngs ? n.lngs : this.languageUtils.toResolveHierarchy(n.lng || this.language, n.fallbackLng);
      c.forEach((x) => {
        this.isValidLookup(r) || (a = x, !this.checkedLoadedFor[`${y[0]}-${x}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(a) && (this.checkedLoadedFor[`${y[0]}-${x}`] = !0, this.logger.warn(`key "${i}" for languages "${y.join(", ")}" won't get resolved as namespace "${a}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!")), y.forEach((b) => {
          if (this.isValidLookup(r)) return;
          o = b;
          const v = [f];
          if (this.i18nFormat?.addLookupKeys)
            this.i18nFormat.addLookupKeys(v, f, b, x, n);
          else {
            let I;
            p && (I = this.pluralResolver.getSuffix(b, n.count, n));
            const O = `${this.options.pluralSeparator}zero`, S = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
            if (p && (n.ordinal && I.startsWith(S) && v.push(f + I.replace(S, this.options.pluralSeparator)), v.push(f + I), h && v.push(f + O)), d) {
              const z = `${f}${this.options.contextSeparator || "_"}${n.context}`;
              v.push(z), p && (n.ordinal && I.startsWith(S) && v.push(z + I.replace(S, this.options.pluralSeparator)), v.push(z + I), h && v.push(z + O));
            }
          }
          let w;
          for (; w = v.pop(); )
            this.isValidLookup(r) || (s = w, r = this.getResource(b, x, w, n));
        }));
      });
    }), {
      res: r,
      usedKey: i,
      exactUsedKey: s,
      usedLng: o,
      usedNS: a
    };
  }
  isValidLookup(t) {
    return t !== void 0 && !(!this.options.returnNull && t === null) && !(!this.options.returnEmptyString && t === "");
  }
  getResource(t, n, r, i = {}) {
    return this.i18nFormat?.getResource ? this.i18nFormat.getResource(t, n, r, i) : this.resourceStore.getResource(t, n, r, i);
  }
  getUsedParamsDetails(t = {}) {
    const n = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"], r = t.replace && !M(t.replace);
    let i = r ? t.replace : t;
    if (r && typeof t.count < "u" && (i = {
      ...i,
      count: t.count
    }), this.options.interpolation.defaultVariables && (i = {
      ...this.options.interpolation.defaultVariables,
      ...i
    }), !r) {
      i = {
        ...i
      };
      for (const s of n)
        delete i[s];
    }
    return i;
  }
  static hasDefaultValue(t) {
    const n = "defaultValue";
    for (const r in t)
      if (Object.prototype.hasOwnProperty.call(t, r) && r.startsWith(n) && t[r] !== void 0)
        return !0;
    return !1;
  }
}
class br {
  constructor(t) {
    this.options = t, this.supportedLngs = this.options.supportedLngs || !1, this.logger = ve.create("languageUtils");
  }
  getScriptPartFromCode(t) {
    if (t = St(t), !t || !t.includes("-")) return null;
    const n = t.split("-");
    return n.length === 2 || (n.pop(), n[n.length - 1].toLowerCase() === "x") ? null : this.formatLanguageCode(n.join("-"));
  }
  getLanguagePartFromCode(t) {
    if (t = St(t), !t || !t.includes("-")) return t;
    const n = t.split("-");
    return this.formatLanguageCode(n[0]);
  }
  formatLanguageCode(t) {
    if (M(t) && t.includes("-")) {
      let n;
      try {
        n = Intl.getCanonicalLocales(t)[0];
      } catch {
      }
      return n && this.options.lowerCaseLng && (n = n.toLowerCase()), n || (this.options.lowerCaseLng ? t.toLowerCase() : t);
    }
    return this.options.cleanCode || this.options.lowerCaseLng ? t.toLowerCase() : t;
  }
  isSupportedCode(t) {
    return (this.options.load === "languageOnly" || this.options.nonExplicitSupportedLngs) && (t = this.getLanguagePartFromCode(t)), !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.includes(t);
  }
  getBestMatchFromCodes(t) {
    if (!t) return null;
    let n;
    return t.forEach((r) => {
      if (n) return;
      const i = this.formatLanguageCode(r);
      (!this.options.supportedLngs || this.isSupportedCode(i)) && (n = i);
    }), !n && this.options.supportedLngs && t.forEach((r) => {
      if (n) return;
      const i = this.getScriptPartFromCode(r);
      if (this.isSupportedCode(i)) return n = i;
      const s = this.getLanguagePartFromCode(r);
      if (this.isSupportedCode(s)) return n = s;
      n = this.options.supportedLngs.find((o) => o === s ? !0 : !o.includes("-") && !s.includes("-") ? !1 : !!(o.includes("-") && !s.includes("-") && o.slice(0, o.indexOf("-")) === s || o.startsWith(s) && s.length > 1));
    }), n || (n = this.getFallbackCodes(this.options.fallbackLng)[0]), n;
  }
  getFallbackCodes(t, n) {
    if (!t) return [];
    if (typeof t == "function" && (t = t(n)), M(t) && (t = [t]), Array.isArray(t)) return t;
    if (!n) return t.default || [];
    let r = t[n];
    return r || (r = t[this.getScriptPartFromCode(n)]), r || (r = t[this.formatLanguageCode(n)]), r || (r = t[this.getLanguagePartFromCode(n)]), r || (r = t.default), r || [];
  }
  toResolveHierarchy(t, n) {
    const r = this.getFallbackCodes((n === !1 ? [] : n) || this.options.fallbackLng || [], t), i = [], s = (o) => {
      o && (this.isSupportedCode(o) ? i.push(o) : this.logger.warn(`rejecting language code not found in supportedLngs: ${o}`));
    };
    return M(t) && (t.includes("-") || t.includes("_")) ? (this.options.load !== "languageOnly" && s(this.formatLanguageCode(t)), this.options.load !== "languageOnly" && this.options.load !== "currentOnly" && s(this.getScriptPartFromCode(t)), this.options.load !== "currentOnly" && s(this.getLanguagePartFromCode(t))) : M(t) && s(this.formatLanguageCode(t)), r.forEach((o) => {
      i.includes(o) || s(this.formatLanguageCode(o));
    }), i;
  }
}
const xr = {
  zero: 0,
  one: 1,
  two: 2,
  few: 3,
  many: 4,
  other: 5
}, kr = {
  select: (e) => e === 1 ? "one" : "other",
  resolvedOptions: () => ({
    pluralCategories: ["one", "other"]
  })
};
class Co {
  constructor(t, n = {}) {
    this.languageUtils = t, this.options = n, this.logger = ve.create("pluralResolver"), this.pluralRulesCache = {};
  }
  clearCache() {
    this.pluralRulesCache = {};
  }
  getRule(t, n = {}) {
    const r = St(t === "dev" ? "en" : t), i = n.ordinal ? "ordinal" : "cardinal", s = JSON.stringify({
      cleanedCode: r,
      type: i
    });
    if (s in this.pluralRulesCache)
      return this.pluralRulesCache[s];
    let o;
    try {
      o = new Intl.PluralRules(r, {
        type: i
      });
    } catch {
      if (typeof Intl > "u")
        return this.logger.error("No Intl support, please use an Intl polyfill!"), kr;
      if (!t.match(/-|_/)) return kr;
      const u = this.languageUtils.getLanguagePartFromCode(t);
      o = this.getRule(u, n);
    }
    return this.pluralRulesCache[s] = o, o;
  }
  needsPlural(t, n = {}) {
    let r = this.getRule(t, n);
    return r || (r = this.getRule("dev", n)), r?.resolvedOptions().pluralCategories.length > 1;
  }
  getPluralFormsOfKey(t, n, r = {}) {
    return this.getSuffixes(t, r).map((i) => `${n}${i}`);
  }
  getSuffixes(t, n = {}) {
    let r = this.getRule(t, n);
    return r || (r = this.getRule("dev", n)), r ? r.resolvedOptions().pluralCategories.sort((i, s) => xr[i] - xr[s]).map((i) => `${this.options.prepend}${n.ordinal ? `ordinal${this.options.prepend}` : ""}${i}`) : [];
  }
  getSuffix(t, n, r = {}) {
    const i = this.getRule(t, r);
    return i ? `${this.options.prepend}${r.ordinal ? `ordinal${this.options.prepend}` : ""}${i.select(n)}` : (this.logger.warn(`no plural rule found for: ${t}`), this.getSuffix("dev", n, r));
  }
}
const wr = (e, t, n, r = ".", i = !0) => {
  let s = go(e, t, n);
  return !s && i && M(n) && (s = In(e, n, r), s === void 0 && (s = In(t, n, r))), s;
}, Eo = (e) => e.replace(/\$/g, "$$$$");
class Sr {
  constructor(t = {}) {
    this.logger = ve.create("interpolator"), this.options = t, this.format = t?.interpolation?.format || ((n) => n), this.init(t);
  }
  init(t = {}) {
    t.interpolation || (t.interpolation = {
      escapeValue: !0
    });
    const {
      escape: n,
      escapeValue: r,
      useRawValueToEscape: i,
      prefix: s,
      prefixEscaped: o,
      suffix: a,
      suffixEscaped: u,
      formatSeparator: l,
      unescapeSuffix: f,
      unescapePrefix: c,
      nestingPrefix: p,
      nestingPrefixEscaped: h,
      nestingSuffix: d,
      nestingSuffixEscaped: y,
      nestingOptionsSeparator: x,
      maxReplaces: b,
      alwaysFormat: v
    } = t.interpolation;
    this.escape = n !== void 0 ? n : yo, this.escapeValue = r !== void 0 ? r : !0, this.useRawValueToEscape = i !== void 0 ? i : !1, this.prefix = s ? Le(s) : o || "{{", this.suffix = a ? Le(a) : u || "}}", this.formatSeparator = l || ",", this.unescapePrefix = f ? "" : c ? Le(c) : "-", this.unescapeSuffix = this.unescapePrefix ? "" : f ? Le(f) : "", this.nestingPrefix = p ? Le(p) : h || Le("$t("), this.nestingSuffix = d ? Le(d) : y || Le(")"), this.nestingOptionsSeparator = x || ",", this.maxReplaces = b || 1e3, this.alwaysFormat = v !== void 0 ? v : !1, this.resetRegExp();
  }
  reset() {
    this.options && this.init(this.options);
  }
  resetRegExp() {
    const t = (n, r) => n?.source === r ? (n.lastIndex = 0, n) : new RegExp(r, "g");
    this.regexp = t(this.regexp, `${this.prefix}(.+?)${this.suffix}`), this.regexpUnescape = t(this.regexpUnescape, `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`), this.nestingRegexp = t(this.nestingRegexp, `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`);
  }
  interpolate(t, n, r, i) {
    let s, o, a;
    const u = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {}, l = (h) => {
      if (!h.includes(this.formatSeparator)) {
        const b = wr(n, u, h, this.options.keySeparator, this.options.ignoreJSONStructure);
        return this.alwaysFormat ? this.format(b, void 0, r, {
          ...i,
          ...n,
          interpolationkey: h
        }) : b;
      }
      const d = h.split(this.formatSeparator), y = d.shift().trim(), x = d.join(this.formatSeparator).trim();
      return this.format(wr(n, u, y, this.options.keySeparator, this.options.ignoreJSONStructure), x, r, {
        ...i,
        ...n,
        interpolationkey: y
      });
    };
    this.resetRegExp(), !this.escapeValue && typeof t == "string" && /\$t\([^)]*\{[^}]*\{\{/.test(t) && this.logger.warn("nesting options string contains interpolated variables with escapeValue: false — if any of those values are attacker-controlled they can inject additional nesting options (e.g. redirect lng/ns). Sanitise untrusted input before passing it to t(), or keep escapeValue: true.");
    const f = i?.missingInterpolationHandler || this.options.missingInterpolationHandler, c = i?.interpolation?.skipOnVariables !== void 0 ? i.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
    return [{
      regex: this.regexpUnescape,
      safeValue: (h) => h
    }, {
      regex: this.regexp,
      safeValue: (h) => this.escapeValue ? this.escape(h) : h
    }].forEach((h) => {
      for (a = 0; s = h.regex.exec(t); ) {
        const d = s[1].trim();
        if (o = l(d), o === void 0)
          if (typeof f == "function") {
            const x = f(t, s, i);
            o = M(x) ? x : "";
          } else if (i && Object.prototype.hasOwnProperty.call(i, d))
            o = "";
          else if (c) {
            o = s[0];
            continue;
          } else
            this.logger.warn(`missed to pass in variable ${d} for interpolating ${t}`), o = "";
        else !M(o) && !this.useRawValueToEscape && (o = pr(o));
        const y = h.safeValue(o);
        if (t = t.replace(s[0], Eo(y)), c ? (h.regex.lastIndex += y.length, h.regex.lastIndex -= s[0].length) : h.regex.lastIndex = 0, a++, a >= this.maxReplaces)
          break;
      }
    }), t;
  }
  nest(t, n, r = {}) {
    let i, s, o;
    const a = (u, l) => {
      const f = this.nestingOptionsSeparator;
      if (!u.includes(f)) return u;
      const c = u.split(new RegExp(`${Le(f)}[ ]*{`));
      let p = `{${c[1]}`;
      u = c[0], p = this.interpolate(p, o);
      const h = p.match(/'/g), d = p.match(/"/g);
      ((h?.length ?? 0) % 2 === 0 && !d || (d?.length ?? 0) % 2 !== 0) && (p = p.replace(/'/g, '"'));
      try {
        o = JSON.parse(p), l && (o = {
          ...l,
          ...o
        });
      } catch (y) {
        return this.logger.warn(`failed parsing options string in nesting for key ${u}`, y), `${u}${f}${p}`;
      }
      return o.defaultValue && o.defaultValue.includes(this.prefix) && delete o.defaultValue, u;
    };
    for (; i = this.nestingRegexp.exec(t); ) {
      let u = [];
      o = {
        ...r
      }, o = o.replace && !M(o.replace) ? o.replace : o, o.applyPostProcessor = !1, delete o.defaultValue;
      const l = /{.*}/s.test(i[1]) ? i[1].lastIndexOf("}") + 1 : i[1].indexOf(this.formatSeparator);
      if (l !== -1 && (u = i[1].slice(l).split(this.formatSeparator).map((f) => f.trim()).filter(Boolean), i[1] = i[1].slice(0, l)), s = n(a.call(this, i[1].trim(), o), o), s && i[0] === t && !M(s)) return s;
      M(s) || (s = pr(s)), s || (this.logger.warn(`missed to resolve ${i[1]} for nesting ${t}`), s = ""), u.length && (s = u.reduce((f, c) => this.format(f, c, r.lng, {
        ...r,
        interpolationkey: i[1].trim()
      }), s.trim())), t = t.replace(i[0], s), this.regexp.lastIndex = 0;
    }
    return t;
  }
}
const Io = (e) => {
  let t = e.toLowerCase().trim();
  const n = {};
  if (e.includes("(")) {
    const r = e.split("(");
    t = r[0].toLowerCase().trim();
    const i = r[1].slice(0, -1);
    t === "currency" && !i.includes(":") ? n.currency || (n.currency = i.trim()) : t === "relativetime" && !i.includes(":") ? n.range || (n.range = i.trim()) : i.split(";").forEach((o) => {
      if (o) {
        const [a, ...u] = o.split(":"), l = u.join(":").trim().replace(/^'+|'+$/g, ""), f = a.trim();
        n[f] || (n[f] = l), l === "false" && (n[f] = !1), l === "true" && (n[f] = !0), isNaN(l) || (n[f] = parseInt(l, 10));
      }
    });
  }
  return {
    formatName: t,
    formatOptions: n
  };
}, vr = (e) => {
  const t = {};
  return (n, r, i) => {
    let s = i;
    i && i.interpolationkey && i.formatParams && i.formatParams[i.interpolationkey] && i[i.interpolationkey] && (s = {
      ...s,
      [i.interpolationkey]: void 0
    });
    const o = r + JSON.stringify(s);
    let a = t[o];
    return a || (a = e(St(r), i), t[o] = a), a(n);
  };
}, To = (e) => (t, n, r) => e(St(n), r)(t);
class Lo {
  constructor(t = {}) {
    this.logger = ve.create("formatter"), this.options = t, this.init(t);
  }
  init(t, n = {
    interpolation: {}
  }) {
    this.formatSeparator = n.interpolation.formatSeparator || ",";
    const r = n.cacheInBuiltFormats ? vr : To;
    this.formats = {
      number: r((i, s) => {
        const o = new Intl.NumberFormat(i, {
          ...s
        });
        return (a) => o.format(a);
      }),
      currency: r((i, s) => {
        const o = new Intl.NumberFormat(i, {
          ...s,
          style: "currency"
        });
        return (a) => o.format(a);
      }),
      datetime: r((i, s) => {
        const o = new Intl.DateTimeFormat(i, {
          ...s
        });
        return (a) => o.format(a);
      }),
      relativetime: r((i, s) => {
        const o = new Intl.RelativeTimeFormat(i, {
          ...s
        });
        return (a) => o.format(a, s.range || "day");
      }),
      list: r((i, s) => {
        const o = new Intl.ListFormat(i, {
          ...s
        });
        return (a) => o.format(a);
      })
    };
  }
  add(t, n) {
    this.formats[t.toLowerCase().trim()] = n;
  }
  addCached(t, n) {
    this.formats[t.toLowerCase().trim()] = vr(n);
  }
  format(t, n, r, i = {}) {
    if (!n || t == null) return t;
    const s = n.split(this.formatSeparator), o = [];
    for (let u = 0; u < s.length; u++) {
      let l = s[u];
      for (; l.indexOf("(") > -1 && !l.includes(")") && u + 1 < s.length; )
        l = `${l}${this.formatSeparator}${s[++u]}`;
      o.push(l);
    }
    return o.reduce((u, l) => {
      const {
        formatName: f,
        formatOptions: c
      } = Io(l);
      if (this.formats[f]) {
        let p = u;
        try {
          const h = i?.formatParams?.[i.interpolationkey] || {}, d = h.locale || h.lng || i.locale || i.lng || r;
          p = this.formats[f](u, d, {
            ...c,
            ...i,
            ...h
          });
        } catch (h) {
          this.logger.warn(h);
        }
        return p;
      } else
        this.logger.warn(`there was no format function for ${f}`);
      return u;
    }, t);
  }
}
const No = (e, t) => {
  e.pending[t] !== void 0 && (delete e.pending[t], e.pendingCount--);
};
class Ao extends Wt {
  constructor(t, n, r, i = {}) {
    super(), this.backend = t, this.store = n, this.services = r, this.languageUtils = r.languageUtils, this.options = i, this.logger = ve.create("backendConnector"), this.waitingReads = [], this.maxParallelReads = i.maxParallelReads || 10, this.readingCalls = 0, this.maxRetries = i.maxRetries >= 0 ? i.maxRetries : 5, this.retryTimeout = i.retryTimeout >= 1 ? i.retryTimeout : 350, this.state = {}, this.queue = [], this.backend?.init?.(r, i.backend, i);
  }
  queueLoad(t, n, r, i) {
    const s = {}, o = {}, a = {}, u = {};
    return t.forEach((l) => {
      let f = !0;
      n.forEach((c) => {
        const p = `${l}|${c}`;
        !r.reload && this.store.hasResourceBundle(l, c) ? this.state[p] = 2 : this.state[p] < 0 || (this.state[p] === 1 ? o[p] === void 0 && (o[p] = !0) : (this.state[p] = 1, f = !1, o[p] === void 0 && (o[p] = !0), s[p] === void 0 && (s[p] = !0), u[c] === void 0 && (u[c] = !0)));
      }), f || (a[l] = !0);
    }), (Object.keys(s).length || Object.keys(o).length) && this.queue.push({
      pending: o,
      pendingCount: Object.keys(o).length,
      loaded: {},
      errors: [],
      callback: i
    }), {
      toLoad: Object.keys(s),
      pending: Object.keys(o),
      toLoadLanguages: Object.keys(a),
      toLoadNamespaces: Object.keys(u)
    };
  }
  loaded(t, n, r) {
    const i = t.split("|"), s = i[0], o = i[1];
    n && this.emit("failedLoading", s, o, n), !n && r && this.store.addResourceBundle(s, o, r, void 0, void 0, {
      skipCopy: !0
    }), this.state[t] = n ? -1 : 2, n && r && (this.state[t] = 0);
    const a = {};
    this.queue.forEach((u) => {
      po(u.loaded, [s], o), No(u, t), n && u.errors.push(n), u.pendingCount === 0 && !u.done && (Object.keys(u.loaded).forEach((l) => {
        a[l] || (a[l] = {});
        const f = u.loaded[l];
        f.length && f.forEach((c) => {
          a[l][c] === void 0 && (a[l][c] = !0);
        });
      }), u.done = !0, u.errors.length ? u.callback(u.errors) : u.callback());
    }), this.emit("loaded", a), this.queue = this.queue.filter((u) => !u.done);
  }
  read(t, n, r, i = 0, s = this.retryTimeout, o) {
    if (!t.length) return o(null, {});
    if (this.readingCalls >= this.maxParallelReads) {
      this.waitingReads.push({
        lng: t,
        ns: n,
        fcName: r,
        tried: i,
        wait: s,
        callback: o
      });
      return;
    }
    this.readingCalls++;
    const a = (l, f) => {
      if (this.readingCalls--, this.waitingReads.length > 0) {
        const c = this.waitingReads.shift();
        this.read(c.lng, c.ns, c.fcName, c.tried, c.wait, c.callback);
      }
      if (l && f && i < this.maxRetries) {
        setTimeout(() => {
          this.read(t, n, r, i + 1, s * 2, o);
        }, s);
        return;
      }
      o(l, f);
    }, u = this.backend[r].bind(this.backend);
    if (u.length === 2) {
      try {
        const l = u(t, n);
        l && typeof l.then == "function" ? l.then((f) => a(null, f)).catch(a) : a(null, l);
      } catch (l) {
        a(l);
      }
      return;
    }
    return u(t, n, a);
  }
  prepareLoading(t, n, r = {}, i) {
    if (!this.backend)
      return this.logger.warn("No backend was added via i18next.use. Will not load resources."), i && i();
    M(t) && (t = this.languageUtils.toResolveHierarchy(t)), M(n) && (n = [n]);
    const s = this.queueLoad(t, n, r, i);
    if (!s.toLoad.length)
      return s.pending.length || i(), null;
    s.toLoad.forEach((o) => {
      this.loadOne(o);
    });
  }
  load(t, n, r) {
    this.prepareLoading(t, n, {}, r);
  }
  reload(t, n, r) {
    this.prepareLoading(t, n, {
      reload: !0
    }, r);
  }
  loadOne(t, n = "") {
    const r = t.split("|"), i = r[0], s = r[1];
    this.read(i, s, "read", void 0, void 0, (o, a) => {
      o && this.logger.warn(`${n}loading namespace ${s} for language ${i} failed`, o), !o && a && this.logger.log(`${n}loaded namespace ${s} for language ${i}`, a), this.loaded(t, o, a);
    });
  }
  saveMissing(t, n, r, i, s, o = {}, a = () => {
  }) {
    if (this.services?.utils?.hasLoadedNamespace && !this.services?.utils?.hasLoadedNamespace(n)) {
      this.logger.warn(`did not save key "${r}" as the namespace "${n}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!");
      return;
    }
    if (!(r == null || r === "")) {
      if (this.backend?.create) {
        const u = {
          ...o,
          isUpdate: s
        }, l = this.backend.create.bind(this.backend);
        if (l.length < 6)
          try {
            let f;
            l.length === 5 ? f = l(t, n, r, i, u) : f = l(t, n, r, i), f && typeof f.then == "function" ? f.then((c) => a(null, c)).catch(a) : a(null, f);
          } catch (f) {
            a(f);
          }
        else
          l(t, n, r, i, a, u);
      }
      !t || !t[0] || this.store.addResource(t[0], n, r, i);
    }
  }
}
const en = () => ({
  debug: !1,
  initAsync: !0,
  ns: ["translation"],
  defaultNS: ["translation"],
  fallbackLng: ["dev"],
  fallbackNS: !1,
  supportedLngs: !1,
  nonExplicitSupportedLngs: !1,
  load: "all",
  preload: !1,
  keySeparator: ".",
  nsSeparator: ":",
  pluralSeparator: "_",
  contextSeparator: "_",
  enableSelector: !1,
  partialBundledLanguages: !1,
  saveMissing: !1,
  updateMissing: !1,
  saveMissingTo: "fallback",
  saveMissingPlurals: !0,
  missingKeyHandler: !1,
  missingInterpolationHandler: !1,
  postProcess: !1,
  postProcessPassResolved: !1,
  returnNull: !1,
  returnEmptyString: !0,
  returnObjects: !1,
  joinArrays: !1,
  returnedObjectHandler: !1,
  parseMissingKeyHandler: !1,
  appendNamespaceToMissingKey: !1,
  appendNamespaceToCIMode: !1,
  overloadTranslationOptionHandler: (e) => {
    let t = {};
    if (typeof e[1] == "object" && (t = e[1]), M(e[1]) && (t.defaultValue = e[1]), M(e[2]) && (t.tDescription = e[2]), typeof e[2] == "object" || typeof e[3] == "object") {
      const n = e[3] || e[2];
      Object.keys(n).forEach((r) => {
        t[r] = n[r];
      });
    }
    return t;
  },
  interpolation: {
    escapeValue: !0,
    prefix: "{{",
    suffix: "}}",
    formatSeparator: ",",
    unescapePrefix: "-",
    nestingPrefix: "$t(",
    nestingSuffix: ")",
    nestingOptionsSeparator: ",",
    maxReplaces: 1e3,
    skipOnVariables: !0
  },
  cacheInBuiltFormats: !0
}), Cr = (e) => (M(e.ns) && (e.ns = [e.ns]), M(e.fallbackLng) && (e.fallbackLng = [e.fallbackLng]), M(e.fallbackNS) && (e.fallbackNS = [e.fallbackNS]), e.supportedLngs && !e.supportedLngs.includes("cimode") && (e.supportedLngs = e.supportedLngs.concat(["cimode"])), e), At = () => {
}, Ro = (e) => {
  Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach((n) => {
    typeof e[n] == "function" && (e[n] = e[n].bind(e));
  });
};
class yt extends Wt {
  constructor(t = {}, n) {
    if (super(), this.options = Cr(t), this.services = {}, this.logger = ve, this.modules = {
      external: []
    }, Ro(this), n && !this.isInitialized && !t.isClone) {
      if (!this.options.initAsync)
        return this.init(t, n), this;
      setTimeout(() => {
        this.init(t, n);
      }, 0);
    }
  }
  init(t = {}, n) {
    this.isInitializing = !0, typeof t == "function" && (n = t, t = {}), t.defaultNS == null && t.ns && (M(t.ns) ? t.defaultNS = t.ns : t.ns.includes("translation") || (t.defaultNS = t.ns[0]));
    const r = en();
    this.options = {
      ...r,
      ...this.options,
      ...Cr(t)
    }, this.options.interpolation = {
      ...r.interpolation,
      ...this.options.interpolation
    }, t.keySeparator !== void 0 && (this.options.userDefinedKeySeparator = t.keySeparator), t.nsSeparator !== void 0 && (this.options.userDefinedNsSeparator = t.nsSeparator), typeof this.options.overloadTranslationOptionHandler != "function" && (this.options.overloadTranslationOptionHandler = r.overloadTranslationOptionHandler);
    const i = (l) => l ? typeof l == "function" ? new l() : l : null;
    if (!this.options.isClone) {
      this.modules.logger ? ve.init(i(this.modules.logger), this.options) : ve.init(null, this.options);
      let l;
      this.modules.formatter ? l = this.modules.formatter : l = Lo;
      const f = new br(this.options);
      this.store = new yr(this.options.resources, this.options);
      const c = this.services;
      c.logger = ve, c.resourceStore = this.store, c.languageUtils = f, c.pluralResolver = new Co(f, {
        prepend: this.options.pluralSeparator
      }), l && (c.formatter = i(l), c.formatter.init && c.formatter.init(c, this.options), this.options.interpolation.format = c.formatter.format.bind(c.formatter)), c.interpolator = new Sr(this.options), c.utils = {
        hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
      }, c.backendConnector = new Ao(i(this.modules.backend), c.resourceStore, c, this.options), c.backendConnector.on("*", (p, ...h) => {
        this.emit(p, ...h);
      }), this.modules.languageDetector && (c.languageDetector = i(this.modules.languageDetector), c.languageDetector.init && c.languageDetector.init(c, this.options.detection, this.options)), this.modules.i18nFormat && (c.i18nFormat = i(this.modules.i18nFormat), c.i18nFormat.init && c.i18nFormat.init(this)), this.translator = new Ut(this.services, this.options), this.translator.on("*", (p, ...h) => {
        this.emit(p, ...h);
      }), this.modules.external.forEach((p) => {
        p.init && p.init(this);
      });
    }
    if (this.format = this.options.interpolation.format, n || (n = At), this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
      const l = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
      l.length > 0 && l[0] !== "dev" && (this.options.lng = l[0]);
    }
    !this.services.languageDetector && !this.options.lng && this.logger.warn("init: no languageDetector is used and no lng is defined"), ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"].forEach((l) => {
      this[l] = (...f) => this.store[l](...f);
    }), ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"].forEach((l) => {
      this[l] = (...f) => (this.store[l](...f), this);
    });
    const a = ct(), u = () => {
      const l = (f, c) => {
        this.isInitializing = !1, this.isInitialized && !this.initializedStoreOnce && this.logger.warn("init: i18next is already initialized. You should call init just once!"), this.isInitialized = !0, this.options.isClone || this.logger.log("initialized", this.options), this.emit("initialized", this.options), a.resolve(c), n(f, c);
      };
      if ((this.languages || this.isLanguageChangingTo) && !this.isInitialized) return l(null, this.t.bind(this));
      this.changeLanguage(this.options.lng, l);
    };
    return this.options.resources || !this.options.initAsync ? u() : setTimeout(u, 0), a;
  }
  loadResources(t, n = At) {
    let r = n;
    const i = M(t) ? t : this.language;
    if (typeof t == "function" && (r = t), !this.options.resources || this.options.partialBundledLanguages) {
      if (i?.toLowerCase() === "cimode" && (!this.options.preload || this.options.preload.length === 0)) return r();
      const s = [], o = (a) => {
        if (!a || a === "cimode") return;
        this.services.languageUtils.toResolveHierarchy(a).forEach((l) => {
          l !== "cimode" && (s.includes(l) || s.push(l));
        });
      };
      i ? o(i) : this.services.languageUtils.getFallbackCodes(this.options.fallbackLng).forEach((u) => o(u)), this.options.preload?.forEach?.((a) => o(a)), this.services.backendConnector.load(s, this.options.ns, (a) => {
        !a && !this.resolvedLanguage && this.language && this.setResolvedLanguage(this.language), r(a);
      });
    } else
      r(null);
  }
  reloadResources(t, n, r) {
    const i = ct();
    return typeof t == "function" && (r = t, t = void 0), typeof n == "function" && (r = n, n = void 0), t || (t = this.languages), n || (n = this.options.ns), r || (r = At), this.services.backendConnector.reload(t, n, (s) => {
      i.resolve(), r(s);
    }), i;
  }
  use(t) {
    if (!t) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
    if (!t.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
    return t.type === "backend" && (this.modules.backend = t), (t.type === "logger" || t.log && t.warn && t.error) && (this.modules.logger = t), t.type === "languageDetector" && (this.modules.languageDetector = t), t.type === "i18nFormat" && (this.modules.i18nFormat = t), t.type === "postProcessor" && Di.addPostProcessor(t), t.type === "formatter" && (this.modules.formatter = t), t.type === "3rdParty" && this.modules.external.push(t), this;
  }
  setResolvedLanguage(t) {
    if (!(!t || !this.languages) && !["cimode", "dev"].includes(t)) {
      for (let n = 0; n < this.languages.length; n++) {
        const r = this.languages[n];
        if (!["cimode", "dev"].includes(r) && this.store.hasLanguageSomeTranslations(r)) {
          this.resolvedLanguage = r;
          break;
        }
      }
      !this.resolvedLanguage && !this.languages.includes(t) && this.store.hasLanguageSomeTranslations(t) && (this.resolvedLanguage = t, this.languages.unshift(t));
    }
  }
  changeLanguage(t, n) {
    this.isLanguageChangingTo = t;
    const r = ct();
    this.emit("languageChanging", t);
    const i = (a) => {
      this.language = a, this.languages = this.services.languageUtils.toResolveHierarchy(a), this.resolvedLanguage = void 0, this.setResolvedLanguage(a);
    }, s = (a, u) => {
      u ? this.isLanguageChangingTo === t && (i(u), this.translator.changeLanguage(u), this.isLanguageChangingTo = void 0, this.emit("languageChanged", u), this.logger.log("languageChanged", u)) : this.isLanguageChangingTo = void 0, r.resolve((...l) => this.t(...l)), n && n(a, (...l) => this.t(...l));
    }, o = (a) => {
      !t && !a && this.services.languageDetector && (a = []);
      const u = M(a) ? a : a && a[0], l = this.store.hasLanguageSomeTranslations(u) ? u : this.services.languageUtils.getBestMatchFromCodes(M(a) ? [a] : a);
      l && (this.language || i(l), this.translator.language || this.translator.changeLanguage(l), this.services.languageDetector?.cacheUserLanguage?.(l)), this.loadResources(l, (f) => {
        s(f, l);
      });
    };
    return !t && this.services.languageDetector && !this.services.languageDetector.async ? o(this.services.languageDetector.detect()) : !t && this.services.languageDetector && this.services.languageDetector.async ? this.services.languageDetector.detect.length === 0 ? this.services.languageDetector.detect().then(o) : this.services.languageDetector.detect(o) : o(t), r;
  }
  getFixedT(t, n, r, i) {
    const s = i?.scopeNs, o = (a, u, ...l) => {
      let f;
      typeof u != "object" ? f = this.options.overloadTranslationOptionHandler([a, u].concat(l)) : f = {
        ...u
      }, f.lng = f.lng || o.lng, f.lngs = f.lngs || o.lngs;
      const c = f.ns !== void 0 && f.ns !== null;
      f.ns = f.ns || o.ns, f.keyPrefix !== "" && (f.keyPrefix = f.keyPrefix || r || o.keyPrefix);
      const p = {
        ...this.options,
        ...f
      };
      Array.isArray(s) && !c && (p.ns = s), typeof f.keyPrefix == "function" && (f.keyPrefix = tt(f.keyPrefix, p));
      const h = this.options.keySeparator || ".";
      let d;
      return f.keyPrefix && Array.isArray(a) ? d = a.map((y) => (typeof y == "function" && (y = tt(y, p)), `${f.keyPrefix}${h}${y}`)) : (typeof a == "function" && (a = tt(a, p)), d = f.keyPrefix ? `${f.keyPrefix}${h}${a}` : a), this.t(d, f);
    };
    return M(t) ? o.lng = t : o.lngs = t, o.ns = n, o.keyPrefix = r, o;
  }
  t(...t) {
    return this.translator?.translate(...t);
  }
  exists(...t) {
    return this.translator?.exists(...t);
  }
  setDefaultNamespace(t) {
    this.options.defaultNS = t;
  }
  hasLoadedNamespace(t, n = {}) {
    if (!this.isInitialized)
      return this.logger.warn("hasLoadedNamespace: i18next was not initialized", this.languages), !1;
    if (!this.languages || !this.languages.length)
      return this.logger.warn("hasLoadedNamespace: i18n.languages were undefined or empty", this.languages), !1;
    const r = n.lng || this.resolvedLanguage || this.languages[0], i = this.options ? this.options.fallbackLng : !1, s = this.languages[this.languages.length - 1];
    if (r.toLowerCase() === "cimode") return !0;
    const o = (a, u) => {
      const l = this.services.backendConnector.state[`${a}|${u}`];
      return l === -1 || l === 0 || l === 2;
    };
    if (n.precheck) {
      const a = n.precheck(this, o);
      if (a !== void 0) return a;
    }
    return !!(this.hasResourceBundle(r, t) || !this.services.backendConnector.backend || this.options.resources && !this.options.partialBundledLanguages || o(r, t) && (!i || o(s, t)));
  }
  loadNamespaces(t, n) {
    const r = ct();
    return this.options.ns ? (M(t) && (t = [t]), t.forEach((i) => {
      this.options.ns.includes(i) || this.options.ns.push(i);
    }), this.loadResources((i) => {
      r.resolve(), n && n(i);
    }), r) : (n && n(), Promise.resolve());
  }
  loadLanguages(t, n) {
    const r = ct();
    M(t) && (t = [t]);
    const i = this.options.preload || [], s = t.filter((o) => !i.includes(o) && this.services.languageUtils.isSupportedCode(o));
    return s.length ? (this.options.preload = i.concat(s), this.loadResources((o) => {
      r.resolve(), n && n(o);
    }), r) : (n && n(), Promise.resolve());
  }
  dir(t) {
    if (t || (t = this.resolvedLanguage || (this.languages?.length > 0 ? this.languages[0] : this.language)), !t) return "rtl";
    try {
      const i = new Intl.Locale(t);
      if (i && i.getTextInfo) {
        const s = i.getTextInfo();
        if (s && s.direction) return s.direction;
      }
    } catch {
    }
    const n = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"], r = this.services?.languageUtils || new br(en());
    return t.toLowerCase().indexOf("-latn") > 1 ? "ltr" : n.includes(r.getLanguagePartFromCode(t)) || t.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
  }
  static createInstance(t = {}, n) {
    const r = new yt(t, n);
    return r.createInstance = yt.createInstance, r;
  }
  cloneInstance(t = {}, n = At) {
    const r = t.forkResourceStore;
    r && delete t.forkResourceStore;
    const i = {
      ...this.options,
      ...t,
      isClone: !0
    }, s = new yt(i);
    if ((t.debug !== void 0 || t.prefix !== void 0) && (s.logger = s.logger.clone(t)), ["store", "services", "language"].forEach((a) => {
      s[a] = this[a];
    }), s.services = {
      ...this.services
    }, s.services.utils = {
      hasLoadedNamespace: s.hasLoadedNamespace.bind(s)
    }, r) {
      const a = Object.keys(this.store.data).reduce((u, l) => (u[l] = {
        ...this.store.data[l]
      }, u[l] = Object.keys(u[l]).reduce((f, c) => (f[c] = {
        ...u[l][c]
      }, f), u[l]), u), {});
      s.store = new yr(a, i), s.services.resourceStore = s.store;
    }
    if (t.interpolation) {
      const u = {
        ...en().interpolation,
        ...this.options.interpolation,
        ...t.interpolation
      }, l = {
        ...i,
        interpolation: u
      };
      s.services.interpolator = new Sr(l);
    }
    return s.translator = new Ut(s.services, i), s.translator.on("*", (a, ...u) => {
      s.emit(a, ...u);
    }), s.init(i, n), s.translator.options = i, s.translator.backendConnector.services.utils = {
      hasLoadedNamespace: s.hasLoadedNamespace.bind(s)
    }, s;
  }
  toJSON() {
    return {
      options: this.options,
      store: this.store,
      language: this.language,
      languages: this.languages,
      resolvedLanguage: this.resolvedLanguage
    };
  }
}
const le = yt.createInstance();
le.createInstance;
le.dir;
le.init;
le.loadResources;
le.reloadResources;
le.use;
le.changeLanguage;
le.getFixedT;
le.t;
le.exists;
le.setDefaultNamespace;
le.hasLoadedNamespace;
le.loadNamespaces;
le.loadLanguages;
function Fi(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
const Oo = (e, t, n, r) => {
  const i = [n, {
    code: t,
    ...r || {}
  }];
  if (e?.services?.logger?.forward)
    return e.services.logger.forward(i, "warn", "react-i18next::", !0);
  Ve(i[0]) && (i[0] = `react-i18next:: ${i[0]}`), e?.services?.logger?.warn ? e.services.logger.warn(...i) : console?.warn && console.warn(...i);
}, Er = {}, zt = (e, t, n, r) => {
  Ve(n) && Er[n] || (Ve(n) && (Er[n] = /* @__PURE__ */ new Date()), Oo(e, t, n, r));
}, zi = (e, t) => () => {
  if (e.isInitialized)
    t();
  else {
    const n = () => {
      setTimeout(() => {
        e.off("initialized", n);
      }, 0), t();
    };
    e.on("initialized", n);
  }
}, Tn = (e, t, n) => {
  e.loadNamespaces(t, zi(e, n));
}, Ir = (e, t, n, r) => {
  if (Ve(n) && (n = [n]), e.options.preload && e.options.preload.indexOf(t) > -1) return Tn(e, n, r);
  n.forEach((i) => {
    e.options.ns.indexOf(i) < 0 && e.options.ns.push(i);
  }), e.loadLanguages(t, zi(e, r));
}, Po = (e, t, n = {}) => !t.languages || !t.languages.length ? (zt(t, "NO_LANGUAGES", "i18n.languages were undefined or empty", {
  languages: t.languages
}), !0) : t.hasLoadedNamespace(e, {
  lng: n.lng,
  precheck: (r, i) => {
    if (n.bindI18n && n.bindI18n.indexOf("languageChanging") > -1 && r.services.backendConnector.backend && r.isLanguageChangingTo && !i(r.isLanguageChangingTo, e)) return !1;
  }
}), Ve = (e) => typeof e == "string", Do = (e) => typeof e == "object" && e !== null, _o = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g, Fo = {
  "&amp;": "&",
  "&#38;": "&",
  "&lt;": "<",
  "&#60;": "<",
  "&gt;": ">",
  "&#62;": ">",
  "&apos;": "'",
  "&#39;": "'",
  "&quot;": '"',
  "&#34;": '"',
  "&nbsp;": " ",
  "&#160;": " ",
  "&copy;": "©",
  "&#169;": "©",
  "&reg;": "®",
  "&#174;": "®",
  "&hellip;": "…",
  "&#8230;": "…",
  "&#x2F;": "/",
  "&#47;": "/"
}, zo = (e) => Fo[e], Mo = (e) => e.replace(_o, zo);
let Ln = {
  bindI18n: "languageChanged",
  bindI18nStore: "",
  transEmptyNodeValue: "",
  transSupportBasicHtmlNodes: !0,
  transWrapTextNodes: "",
  transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p"],
  useSuspense: !0,
  unescape: Mo,
  transDefaultProps: void 0
};
const jo = (e = {}) => {
  Ln = {
    ...Ln,
    ...e
  };
}, $o = () => Ln;
let Mi;
const Bo = (e) => {
  Mi = e;
}, Uo = () => Mi, Ho = {
  type: "3rdParty",
  init(e) {
    jo(e.options.react), Bo(e);
  }
}, ji = lo();
class Vo {
  constructor() {
    this.usedNamespaces = {};
  }
  addUsedNamespaces(t) {
    t.forEach((n) => {
      this.usedNamespaces[n] || (this.usedNamespaces[n] = !0);
    });
  }
  getUsedNamespaces() {
    return Object.keys(this.usedNamespaces);
  }
}
var Rt = { exports: {} }, tn = {};
var Tr;
function qo() {
  if (Tr) return tn;
  Tr = 1;
  var e = Be;
  function t(c, p) {
    return c === p && (c !== 0 || 1 / c === 1 / p) || c !== c && p !== p;
  }
  var n = typeof Object.is == "function" ? Object.is : t, r = e.useState, i = e.useEffect, s = e.useLayoutEffect, o = e.useDebugValue;
  function a(c, p) {
    var h = p(), d = r({ inst: { value: h, getSnapshot: p } }), y = d[0].inst, x = d[1];
    return s(
      function() {
        y.value = h, y.getSnapshot = p, u(y) && x({ inst: y });
      },
      [c, h, p]
    ), i(
      function() {
        return u(y) && x({ inst: y }), c(function() {
          u(y) && x({ inst: y });
        });
      },
      [c]
    ), o(h), h;
  }
  function u(c) {
    var p = c.getSnapshot;
    c = c.value;
    try {
      var h = p();
      return !n(c, h);
    } catch {
      return !0;
    }
  }
  function l(c, p) {
    return p();
  }
  var f = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? l : a;
  return tn.useSyncExternalStore = e.useSyncExternalStore !== void 0 ? e.useSyncExternalStore : f, tn;
}
var nn = {};
var Lr;
function Ko() {
  return Lr || (Lr = 1, process.env.NODE_ENV !== "production" && (function() {
    function e(h, d) {
      return h === d && (h !== 0 || 1 / h === 1 / d) || h !== h && d !== d;
    }
    function t(h, d) {
      f || i.startTransition === void 0 || (f = !0, console.error(
        "You are using an outdated, pre-release alpha of React 18 that does not support useSyncExternalStore. The use-sync-external-store shim will not work correctly. Upgrade to a newer pre-release."
      ));
      var y = d();
      if (!c) {
        var x = d();
        s(y, x) || (console.error(
          "The result of getSnapshot should be cached to avoid an infinite loop"
        ), c = !0);
      }
      x = o({
        inst: { value: y, getSnapshot: d }
      });
      var b = x[0].inst, v = x[1];
      return u(
        function() {
          b.value = y, b.getSnapshot = d, n(b) && v({ inst: b });
        },
        [h, y, d]
      ), a(
        function() {
          return n(b) && v({ inst: b }), h(function() {
            n(b) && v({ inst: b });
          });
        },
        [h]
      ), l(y), y;
    }
    function n(h) {
      var d = h.getSnapshot;
      h = h.value;
      try {
        var y = d();
        return !s(h, y);
      } catch {
        return !0;
      }
    }
    function r(h, d) {
      return d();
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    var i = Be, s = typeof Object.is == "function" ? Object.is : e, o = i.useState, a = i.useEffect, u = i.useLayoutEffect, l = i.useDebugValue, f = !1, c = !1, p = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? r : t;
    nn.useSyncExternalStore = i.useSyncExternalStore !== void 0 ? i.useSyncExternalStore : p, typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })()), nn;
}
var Nr;
function Wo() {
  return Nr || (Nr = 1, process.env.NODE_ENV === "production" ? Rt.exports = qo() : Rt.exports = Ko()), Rt.exports;
}
var Go = Wo();
const Jo = (e, t) => {
  if (Ve(t)) return t;
  if (Do(t) && Ve(t.defaultValue)) return t.defaultValue;
  if (typeof e == "function") return "";
  if (Array.isArray(e)) {
    const n = e[e.length - 1];
    return typeof n == "function" ? "" : n;
  }
  return e;
}, Yo = {
  t: Jo,
  ready: !1
}, Qo = () => () => {
}, xe = (e, t = {}) => {
  const {
    i18n: n
  } = t, {
    i18n: r,
    defaultNS: i
  } = uo(ji) || {}, s = n || r || Uo();
  s && !s.reportNamespaces && (s.reportNamespaces = new Vo()), s || zt(s, "NO_I18NEXT_INSTANCE", "useTranslation: You will need to pass in an i18next instance by using initReactI18next or by passing it via props or context. In monorepo setups, make sure there is only one instance of react-i18next.");
  const o = Ft(() => ({
    ...$o(),
    ...s?.options?.react,
    ...t
  }), [s, t]), {
    useSuspense: a,
    keyPrefix: u
  } = o, l = i || s?.options?.defaultNS, f = Ve(l) ? [l] : l || ["translation"], c = Ft(() => f, f);
  s?.reportNamespaces?.addUsedNamespaces?.(c);
  const p = ae(0), h = De((D) => {
    if (!s) return Qo;
    const {
      bindI18n: k,
      bindI18nStore: L
    } = o, R = () => {
      p.current += 1, D();
    };
    return k && s.on(k, R), L && s.store.on(L, R), () => {
      k && k.split(" ").forEach((_) => s.off(_, R)), L && L.split(" ").forEach((_) => s.store.off(_, R));
    };
  }, [s, o]), d = ae(), y = De(() => {
    if (!s)
      return Yo;
    const D = !!(s.isInitialized || s.initializedStoreOnce) && c.every((A) => Po(A, s, o)), k = t.lng || s.language, L = p.current, R = d.current;
    if (R && R.ready === D && R.lng === k && R.keyPrefix === u && R.revision === L)
      return R;
    const P = {
      t: s.getFixedT(k, o.nsMode === "fallback" ? c : c[0], u, {
        scopeNs: c
      }),
      ready: D,
      lng: k,
      keyPrefix: u,
      revision: L
    };
    return d.current = P, P;
  }, [s, c, u, o, t.lng]), [x, b] = he(0), {
    t: v,
    ready: w
  } = Go.useSyncExternalStore(h, y, y);
  be(() => {
    if (s && !w && !a) {
      const D = () => b((k) => k + 1);
      t.lng ? Ir(s, t.lng, c, D) : Tn(s, c, D);
    }
  }, [s, t.lng, c, w, a, x]);
  const I = s || {}, O = ae(null), S = ae(), z = (D) => {
    const k = Object.getOwnPropertyDescriptors(D);
    k.__original && delete k.__original;
    const L = Object.create(Object.getPrototypeOf(D), k);
    if (!Object.prototype.hasOwnProperty.call(L, "__original"))
      try {
        Object.defineProperty(L, "__original", {
          value: D,
          writable: !1,
          enumerable: !1,
          configurable: !1
        });
      } catch {
      }
    return L;
  }, V = Ft(() => {
    const D = I, k = D?.language;
    let L = D;
    D && (O.current && O.current.__original === D ? S.current !== k ? (L = z(D), O.current = L, S.current = k) : L = O.current : (L = z(D), O.current = L, S.current = k));
    const R = !w && !a ? (...P) => (zt(s, "USE_T_BEFORE_READY", "useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t."), v(...P)) : v, _ = [R, L, w];
    return _.t = R, _.i18n = L, _.ready = w, _;
  }, [v, I, w, I.resolvedLanguage, I.language, I.languages]);
  if (s && a && !w) {
    let D = !1;
    try {
      D = process.env.NODE_ENV !== "production";
    } catch {
    }
    throw D && zt(s, "SUSPENDED_WHILE_LOADING", "useTranslation: suspended while translations are loading (useSuspense is true by default). Add a <Suspense> boundary above this component, or set react.useSuspense: false in the i18next init options. https://react.i18next.com/latest/usetranslation-hook"), new Promise((k) => {
      const L = () => k();
      t.lng ? Ir(s, t.lng, c, L) : Tn(s, c, L);
    });
  }
  return V;
};
function Xo({
  i18n: e,
  defaultNS: t,
  children: n
}) {
  const r = Ft(() => ({
    i18n: e,
    defaultNS: t
  }), [e, t]);
  return co(ji.Provider, {
    value: r
  }, n);
}
const bt = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ru", label: "Русский", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" }
], Zo = {
  en: { translation: {
    appTitle: "FlowDesk Assistant",
    reset: "Start over",
    resetConfirm: "Start over? The current conversation and draft will be cleared.",
    emptyTitle: "How can I help?",
    emptySub: "Describe what you need — I will find the service and raise the request.",
    greeting: "Hello, {{name}}! How can I help you today?",
    senderMe: "Me",
    agentName: "Altiora",
    composerPlaceholder: "Describe what you need…",
    composerDisabled: "Choose an option above…",
    composerHint: "Enter to send · Shift+Enter for a new line",
    send: "Send",
    stop: "Stop",
    micTooltip: "Voice input — coming soon",
    ttsTooltip: "Voice output — coming soon",
    voice: "Voice",
    thinking: "Thinking…",
    node: { LOAD_DRAFT: "Opening the draft…", ROUTER: "Understanding your request…", RESOLVE: "Finding the right service…", SLOT_EXTRACT: "Reading the details…", VALIDATE: "Checking the data…", PATCH: "Saving the draft…", ACTIVE_SLOTS: "Working out what else is needed…", RESOLVERS: "Looking up options…", TERM_CHECK: "Checking readiness…", QUESTION_PLANNER: "Preparing a question…", INFO_ANSWER: "Preparing an answer…", CONFIRM: "Assembling the request…", SUBMIT: "Submitting the request…" },
    choice: { yes: "✓ Yes, correct", chooseOther: "Choose another", search: "🔍 Search…", find: "Find", searchUser: "Name or email…", searchLocation: "Location name…" },
    draft: { title: "Request", empty: "No service selected yet.", emptyHint: "Describe your request in the chat — the draft will appear here.", beneficiary: "Recipient", forSelf: "for me", loading: "Loading fields…", collapse: "Collapse", expand: "Show draft", requestLabel: "Draft request" },
    phase: { context: "Context", routing: "Routing", detail: "Details" },
    provenance: { extracted: "Extracted from your message", user_edited: "Edited manually", context: "From your profile", resolved: "Determined by the system" },
    status: { idle: "draft", active: "draft", draft: "draft", confirmed: "confirming", submitted: "created", escalated: "escalated" },
    time: { justNow: "just now", minutesAgo: "{{count}} min ago" },
    meta: { details: "details ({{count}})" },
    slot: { required: "Required", edit: "Edit", stale: "Needs re-confirmation" },
    liveChat: "Live Chat",
    newChat: "New Chat",
    language: "Language",
    stopped: "Request stopped."
  } },
  ru: { translation: {
    appTitle: "FlowDesk Ассистент",
    reset: "Начать заново",
    resetConfirm: "Начать заново? Текущий диалог и черновик будут очищены.",
    emptyTitle: "Чем могу помочь?",
    emptySub: "Опишите, что вам нужно — я подберу услугу и оформлю заявку.",
    greeting: "Здравствуйте, {{name}}! Чем могу помочь?",
    senderMe: "Я",
    agentName: "Altiora",
    composerPlaceholder: "Опишите, что вам нужно…",
    composerDisabled: "Выберите вариант выше…",
    composerHint: "Enter — отправить · Shift+Enter — новая строка",
    send: "Отправить",
    stop: "Остановить",
    micTooltip: "Голосовой ввод — скоро",
    ttsTooltip: "Озвучивание ответов — скоро",
    voice: "Голос",
    thinking: "Думаю…",
    node: { LOAD_DRAFT: "Открываю черновик…", ROUTER: "Разбираю ваш запрос…", RESOLVE: "Ищу подходящую услугу…", SLOT_EXTRACT: "Извлекаю данные из сообщения…", VALIDATE: "Проверяю данные…", PATCH: "Сохраняю черновик…", ACTIVE_SLOTS: "Определяю, что ещё нужно…", RESOLVERS: "Подбираю варианты…", TERM_CHECK: "Проверяю готовность…", QUESTION_PLANNER: "Формулирую вопрос…", INFO_ANSWER: "Готовлю ответ…", CONFIRM: "Собираю заявку…", SUBMIT: "Оформляю заявку…" },
    choice: { yes: "✓ Да, верно", chooseOther: "Выбрать другого", search: "🔍 Искать…", find: "Найти", searchUser: "Имя или email…", searchLocation: "Название локации…" },
    draft: { title: "Заявка", empty: "Услуга ещё не выбрана.", emptyHint: "Опишите запрос в чате — черновик появится здесь.", beneficiary: "Получатель", forSelf: "для себя", loading: "Загружаю поля…", collapse: "Свернуть", expand: "Показать черновик", requestLabel: "Черновик заявки" },
    phase: { context: "Контекст", routing: "Маршрутизация", detail: "Детали" },
    provenance: { extracted: "Извлечено из сообщения", user_edited: "Изменено вручную", context: "Из вашего профиля", resolved: "Определено системой" },
    status: { idle: "черновик", active: "черновик", draft: "черновик", confirmed: "подтверждается", submitted: "создана", escalated: "эскалация" },
    time: { justNow: "только что", minutesAgo: "{{count}} мин назад" },
    meta: { details: "детали ({{count}})" },
    slot: { required: "Обязательно", edit: "Изменить", stale: "Требует переподтверждения" },
    liveChat: "Живой чат",
    newChat: "Новый чат",
    language: "Язык",
    stopped: "Запрос остановлен."
  } },
  fr: { translation: {
    appTitle: "Assistant FlowDesk",
    reset: "Recommencer",
    resetConfirm: "Recommencer ? La conversation et le brouillon actuels seront effacés.",
    emptyTitle: "Comment puis-je aider ?",
    emptySub: "Décrivez ce dont vous avez besoin — je trouverai le service et créerai la demande.",
    greeting: "Bonjour, {{name}} ! Comment puis-je vous aider aujourd’hui ?",
    senderMe: "Moi",
    agentName: "Altiora",
    composerPlaceholder: "Décrivez ce dont vous avez besoin…",
    composerDisabled: "Choisissez une option ci-dessus…",
    composerHint: "Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne",
    send: "Envoyer",
    stop: "Arrêter",
    micTooltip: "Saisie vocale — bientôt",
    ttsTooltip: "Sortie vocale — bientôt",
    voice: "Voix",
    thinking: "Réflexion…",
    choice: { yes: "✓ Oui, correct", chooseOther: "Choisir un autre", search: "🔍 Rechercher…", find: "Trouver", searchUser: "Nom ou e-mail…", searchLocation: "Nom du lieu…" },
    draft: { title: "Demande", empty: "Aucun service sélectionné.", emptyHint: "Décrivez votre demande dans le chat.", beneficiary: "Bénéficiaire", forSelf: "pour moi", loading: "Chargement…", collapse: "Réduire", expand: "Afficher", requestLabel: "Brouillon" },
    phase: { context: "Contexte", routing: "Routage", detail: "Détails" },
    status: { draft: "brouillon", confirmed: "confirmation", submitted: "créée", escalated: "escalade" },
    time: { justNow: "à l'instant", minutesAgo: "il y a {{count}} min" },
    meta: { details: "détails ({{count}})" },
    slot: { required: "Obligatoire", edit: "Modifier", stale: "À reconfirmer" },
    liveChat: "Chat en direct",
    newChat: "Nouveau chat",
    language: "Langue",
    stopped: "Demande arrêtée."
  } },
  es: { translation: {
    appTitle: "Asistente FlowDesk",
    reset: "Empezar de nuevo",
    resetConfirm: "¿Empezar de nuevo? Se borrará la conversación y el borrador actuales.",
    emptyTitle: "¿En qué puedo ayudar?",
    emptySub: "Describa lo que necesita — encontraré el servicio y crearé la solicitud.",
    greeting: "¡Hola, {{name}}! ¿En qué puedo ayudarle hoy?",
    senderMe: "Yo",
    agentName: "Altiora",
    composerPlaceholder: "Describa lo que necesita…",
    composerDisabled: "Elija una opción arriba…",
    composerHint: "Enter para enviar · Mayús+Enter para una nueva línea",
    send: "Enviar",
    stop: "Detener",
    micTooltip: "Entrada de voz — próximamente",
    ttsTooltip: "Salida de voz — próximamente",
    voice: "Voz",
    thinking: "Pensando…",
    choice: { yes: "✓ Sí, correcto", chooseOther: "Elegir otro", search: "🔍 Buscar…", find: "Buscar", searchUser: "Nombre o correo…", searchLocation: "Nombre del lugar…" },
    draft: { title: "Solicitud", empty: "Ningún servicio seleccionado.", emptyHint: "Describa su solicitud en el chat.", beneficiary: "Beneficiario", forSelf: "para mí", loading: "Cargando…", collapse: "Contraer", expand: "Mostrar", requestLabel: "Borrador" },
    phase: { context: "Contexto", routing: "Enrutamiento", detail: "Detalles" },
    status: { draft: "borrador", confirmed: "confirmando", submitted: "creada", escalated: "escalada" },
    time: { justNow: "ahora mismo", minutesAgo: "hace {{count}} min" },
    meta: { details: "detalles ({{count}})" },
    slot: { required: "Obligatorio", edit: "Editar", stale: "Requiere reconfirmación" },
    liveChat: "Chat en vivo",
    newChat: "Nuevo chat",
    language: "Idioma",
    stopped: "Solicitud detenida."
  } },
  ar: { translation: {
    appTitle: "مساعد FlowDesk",
    reset: "البدء من جديد",
    resetConfirm: "البدء من جديد؟ سيتم مسح المحادثة والمسودة الحاليتين.",
    emptyTitle: "كيف يمكنني المساعدة؟",
    emptySub: "صف ما تحتاجه — سأجد الخدمة وأنشئ الطلب.",
    greeting: "مرحبًا، {{name}}! كيف يمكنني مساعدتك اليوم؟",
    senderMe: "أنا",
    agentName: "Altiora",
    composerPlaceholder: "صف ما تحتاجه…",
    composerDisabled: "اختر خياراً أعلاه…",
    composerHint: "Enter للإرسال · Shift+Enter لسطر جديد",
    send: "إرسال",
    stop: "إيقاف",
    micTooltip: "الإدخال الصوتي — قريباً",
    ttsTooltip: "الإخراج الصوتي — قريباً",
    voice: "صوت",
    thinking: "جارٍ التفكير…",
    choice: { yes: "✓ نعم، صحيح", chooseOther: "اختر آخر", search: "🔍 بحث…", find: "بحث", searchUser: "الاسم أو البريد…", searchLocation: "اسم الموقع…" },
    draft: { title: "طلب", empty: "لم يتم اختيار خدمة.", emptyHint: "صف طلبك في المحادثة.", beneficiary: "المستفيد", forSelf: "لي", loading: "جارٍ التحميل…", collapse: "طيّ", expand: "عرض", requestLabel: "مسودة" },
    phase: { context: "السياق", routing: "التوجيه", detail: "التفاصيل" },
    status: { draft: "مسودة", confirmed: "قيد التأكيد", submitted: "تم الإنشاء", escalated: "تصعيد" },
    time: { justNow: "الآن", minutesAgo: "قبل {{count}} دقيقة" },
    meta: { details: "تفاصيل ({{count}})" },
    slot: { required: "مطلوب", edit: "تعديل", stale: "يحتاج إعادة تأكيد" },
    liveChat: "دردشة مباشرة",
    newChat: "محادثة جديدة",
    language: "اللغة",
    stopped: "تم إيقاف الطلب."
  } },
  zh: { translation: {
    appTitle: "FlowDesk 助手",
    reset: "重新开始",
    resetConfirm: "重新开始？当前对话和草稿将被清除。",
    emptyTitle: "有什么可以帮您？",
    emptySub: "描述您的需求——我会找到相应服务并创建请求。",
    greeting: "您好，{{name}}！今天有什么可以帮您？",
    senderMe: "我",
    agentName: "Altiora",
    composerPlaceholder: "描述您的需求……",
    composerDisabled: "请选择上方选项……",
    composerHint: "Enter 发送 · Shift+Enter 换行",
    send: "发送",
    stop: "停止",
    micTooltip: "语音输入——即将推出",
    ttsTooltip: "语音输出——即将推出",
    voice: "语音",
    thinking: "思考中……",
    choice: { yes: "✓ 是的，正确", chooseOther: "选择其他", search: "🔍 搜索……", find: "查找", searchUser: "姓名或邮箱……", searchLocation: "地点名称……" },
    draft: { title: "请求", empty: "尚未选择服务。", emptyHint: "在聊天中描述您的请求。", beneficiary: "接收人", forSelf: "给我", loading: "加载中……", collapse: "收起", expand: "显示", requestLabel: "草稿" },
    phase: { context: "背景", routing: "路由", detail: "详情" },
    status: { draft: "草稿", confirmed: "确认中", submitted: "已创建", escalated: "升级" },
    time: { justNow: "刚刚", minutesAgo: "{{count}} 分钟前" },
    meta: { details: "详情（{{count}}）" },
    slot: { required: "必填", edit: "编辑", stale: "需要重新确认" },
    liveChat: "在线客服",
    newChat: "新对话",
    language: "语言",
    stopped: "请求已停止。"
  } }
}, $i = "fdv2-lang", Ce = le.createInstance();
Ce.use(Ho).init({
  resources: Zo,
  lng: typeof localStorage < "u" && localStorage.getItem($i) || "en",
  fallbackLng: "en",
  supportedLngs: bt.map((e) => e.code),
  interpolation: { escapeValue: !1 },
  react: { useSuspense: !1 }
});
function ea(e) {
  const t = bt.find((n) => n.code === e);
  return t ? t.dir : "ltr";
}
function Mt() {
  return Ce.language || "en";
}
function Ar() {
  return ea(Mt());
}
function Bi(e) {
  Ce.changeLanguage(e);
  try {
    localStorage.setItem($i, e);
  } catch {
  }
}
const Rr = (e) => {
  let t;
  const n = /* @__PURE__ */ new Set(), r = (l, f) => {
    const c = typeof l == "function" ? l(t) : l;
    if (!Object.is(c, t)) {
      const p = t;
      t = f ?? (typeof c != "object" || c === null) ? c : Object.assign({}, t, c), n.forEach((h) => h(t, p));
    }
  }, i = () => t, a = { setState: r, getState: i, getInitialState: () => u, subscribe: (l) => (n.add(l), () => n.delete(l)) }, u = t = e(r, i, a);
  return a;
}, ta = ((e) => e ? Rr(e) : Rr), na = (e) => e;
function ra(e, t = na) {
  const n = Be.useSyncExternalStore(
    e.subscribe,
    Be.useCallback(() => t(e.getState()), [e, t]),
    Be.useCallback(() => t(e.getInitialState()), [e, t])
  );
  return Be.useDebugValue(n), n;
}
const Or = (e) => {
  const t = ta(e), n = (r) => ra(t, r);
  return Object.assign(n, t), n;
}, ia = ((e) => e ? Or(e) : Or);
function Ui(e, t) {
  let n;
  try {
    n = e();
  } catch {
    return;
  }
  return {
    getItem: (i) => {
      var s;
      const o = (u) => u === null ? null : JSON.parse(u, void 0), a = (s = n.getItem(i)) != null ? s : null;
      return a instanceof Promise ? a.then(o) : o(a);
    },
    setItem: (i, s) => n.setItem(i, JSON.stringify(s, void 0)),
    removeItem: (i) => n.removeItem(i)
  };
}
const Nn = (e) => (t) => {
  try {
    const n = e(t);
    return n instanceof Promise ? n : {
      then(r) {
        return Nn(r)(n);
      },
      catch(r) {
        return this;
      }
    };
  } catch (n) {
    return {
      then(r) {
        return this;
      },
      catch(r) {
        return Nn(r)(n);
      }
    };
  }
}, sa = (e, t) => (n, r, i) => {
  let s = {
    storage: Ui(() => window.localStorage),
    partialize: (x) => x,
    version: 0,
    merge: (x, b) => ({
      ...b,
      ...x
    }),
    ...t
  }, o = !1, a = 0;
  const u = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Set();
  let f = s.storage;
  if (!f)
    return e(
      (...x) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${s.name}', the given storage is currently unavailable.`
        ), n(...x);
      },
      r,
      i
    );
  const c = () => {
    const x = s.partialize({ ...r() });
    return f.setItem(s.name, {
      state: x,
      version: s.version
    });
  }, p = i.setState;
  i.setState = (x, b) => (p(x, b), c());
  const h = e(
    (...x) => (n(...x), c()),
    r,
    i
  );
  i.getInitialState = () => h;
  let d;
  const y = () => {
    var x, b;
    if (!f) return;
    const v = ++a;
    o = !1, u.forEach((I) => {
      var O;
      return I((O = r()) != null ? O : h);
    });
    const w = ((b = s.onRehydrateStorage) == null ? void 0 : b.call(s, (x = r()) != null ? x : h)) || void 0;
    return Nn(f.getItem.bind(f))(s.name).then((I) => {
      if (I)
        if (typeof I.version == "number" && I.version !== s.version) {
          if (s.migrate) {
            const O = s.migrate(
              I.state,
              I.version
            );
            return O instanceof Promise ? O.then((S) => [!0, S]) : [!0, O];
          }
          console.error(
            "State loaded from storage couldn't be migrated since no migrate function was provided"
          );
        } else
          return [!1, I.state];
      return [!1, void 0];
    }).then((I) => {
      var O;
      if (v !== a)
        return;
      const [S, z] = I;
      if (d = s.merge(
        z,
        (O = r()) != null ? O : h
      ), n(d, !0), S)
        return c();
    }).then(() => {
      v === a && (w?.(r(), void 0), d = r(), o = !0, l.forEach((I) => I(d)));
    }).catch((I) => {
      v === a && w?.(void 0, I);
    });
  };
  return i.persist = {
    setOptions: (x) => {
      s = {
        ...s,
        ...x
      }, x.storage && (f = x.storage);
    },
    clearStorage: () => {
      f?.removeItem(s.name);
    },
    getOptions: () => s,
    rehydrate: () => y(),
    hasHydrated: () => o,
    onHydrate: (x) => (u.add(x), () => {
      u.delete(x);
    }),
    onFinishHydration: (x) => (l.add(x), () => {
      l.delete(x);
    })
  }, s.skipHydration || y(), d || h;
}, oa = sa, Pr = (e) => Symbol.iterator in e, Dr = (e) => (
  // HACK: avoid checking entries type
  "entries" in e
), _r = (e, t) => {
  const n = e instanceof Map ? e : new Map(e.entries()), r = t instanceof Map ? t : new Map(t.entries());
  if (n.size !== r.size)
    return !1;
  for (const [i, s] of n)
    if (!r.has(i) || !Object.is(s, r.get(i)))
      return !1;
  return !0;
}, aa = (e, t) => {
  const n = e[Symbol.iterator](), r = t[Symbol.iterator]();
  let i = n.next(), s = r.next();
  for (; !i.done && !s.done; ) {
    if (!Object.is(i.value, s.value))
      return !1;
    i = n.next(), s = r.next();
  }
  return !!i.done && !!s.done;
};
function la(e, t) {
  return Object.is(e, t) ? !0 : typeof e != "object" || e === null || typeof t != "object" || t === null || Object.getPrototypeOf(e) !== Object.getPrototypeOf(t) ? !1 : Pr(e) && Pr(t) ? Dr(e) && Dr(t) ? _r(e, t) : aa(e, t) : _r(
    { entries: () => Object.entries(e) },
    { entries: () => Object.entries(t) }
  );
}
function Un(e) {
  const t = Be.useRef(void 0);
  return (n) => {
    const r = e(n);
    return la(t.current, r) ? t.current : t.current = r;
  };
}
const An = {
  apiBaseUrl: "",
  userId: "fdv2-demo-user",
  getAuthHeaders: null,
  fetchImpl: null,
  eventSourceImpl: null,
  onSubmitted: null,
  onError: null,
  onSessionStart: null
};
let qe = { ...An };
function ua(e = {}) {
  const t = { ...An };
  for (const n of Object.keys(An))
    e[n] !== void 0 && e[n] !== null && (t[n] = e[n]);
  qe = t;
}
function Ue() {
  return qe;
}
function Hn(e) {
  const t = (qe.apiBaseUrl || "").replace(/\/+$/, "");
  if (!t)
    throw new Error(
      '[altiora-chat] apiBaseUrl is not configured. Pass it to <AltioraChat apiBaseUrl="https://host/api/v1" />.'
    );
  return `${t}${e}`;
}
function rt() {
  return qe.fetchImpl || globalThis.fetch.bind(globalThis);
}
async function Ke(e = {}) {
  const t = typeof qe.getAuthHeaders == "function" ? await qe.getAuthHeaders() : null;
  return { ...e, ...t || {} };
}
function Fr(e, ...t) {
  const n = qe[e];
  if (typeof n == "function")
    try {
      n(...t);
    } catch (r) {
      console.error(`[flowdesk-chat-v2] ${e} callback threw:`, r);
    }
}
class Z extends Error {
  constructor(t, n) {
    super(n), this.name = "ChatError", this.code = t;
  }
}
const ca = 12e4, fa = 3, Et = (e) => Hn(e);
async function Hi(e) {
  let t;
  try {
    t = await rt()(Et(`/flowdesk/draft/${encodeURIComponent(e)}`), {
      headers: await Ke()
    });
  } catch (n) {
    throw new Z("NETWORK", n.message);
  }
  if (t.status === 404) return null;
  if (!t.ok) throw new Z("SERVER", `getDraft HTTP ${t.status}`);
  return t.json();
}
async function ha(e) {
  let t;
  try {
    t = await rt()(Et(`/flowdesk/schema/${encodeURIComponent(e)}`), {
      headers: await Ke()
    });
  } catch (n) {
    throw new Z("NETWORK", n.message);
  }
  if (t.status === 404) return null;
  if (!t.ok) throw new Z("SERVER", `getSchema HTTP ${t.status}`);
  return t.json();
}
async function pa(e, t) {
  let n;
  try {
    n = await rt()(Et(`/flowdesk/draft/${encodeURIComponent(e)}`), {
      method: "PATCH",
      headers: await Ke({ "Content-Type": "application/json" }),
      body: JSON.stringify({ patches: t })
    });
  } catch (i) {
    throw new Z("NETWORK", i.message);
  }
  const r = await n.json().catch(() => ({}));
  if (r.error) throw new Z("SERVER", typeof r.error == "string" ? r.error : r.detail || "patch failed");
  if (!n.ok) throw new Z("SERVER", `patchDraft HTTP ${n.status}`);
  return r;
}
async function da(e, t, n, { signal: r, choice: i, controlAction: s, lang: o, userContext: a } = {}) {
  const u = new AbortController(), l = setTimeout(() => u.abort(), ca);
  r && r.addEventListener("abort", () => u.abort(), { once: !0 });
  const f = { sessionId: e, userId: t, lang: o, ...a ? { userContext: a } : {} }, c = s ? { ...f, controlAction: s } : i ? { ...f, choice: i } : { ...f, message: n };
  let p;
  try {
    p = await rt()(Et("/flowdesk/chat"), {
      method: "POST",
      headers: await Ke({ "Content-Type": "application/json" }),
      body: JSON.stringify(c),
      signal: u.signal
    });
  } catch (y) {
    throw clearTimeout(l), y.name === "AbortError" ? new Z("TIMEOUT", "The assistant took too long to respond.") : new Z("NETWORK", y.message);
  }
  clearTimeout(l);
  const h = await p.json().catch(() => {
    throw new Z("SERVER", `Non-JSON response (HTTP ${p.status})`);
  });
  if (h.error) throw new Z("SERVER", typeof h.error == "string" ? h.error : h.detail || "Chat failed");
  if (!p.ok) throw new Z("SERVER", `chat HTTP ${p.status}`);
  let d = null;
  try {
    d = await Hi(e);
  } catch {
  }
  return { ...h, draft: d };
}
const wd = ["connected", "turn:start", "node:start", "node:done", "turn:done"];
function ga(e, t = {}, n = {}) {
  const r = n.EventSourceImpl || Ue().eventSourceImpl || (typeof EventSource < "u" ? EventSource : null);
  if (!r)
    return t.onError?.(new Z("SSE_DISCONNECT", "EventSource unavailable")), () => {
    };
  let i;
  try {
    i = Et(`/flowdesk/chat/${encodeURIComponent(e)}/stream`);
  } catch (c) {
    return t.onError?.(new Z("SSE_DISCONNECT", c.message)), () => {
    };
  }
  let s = null, o = 0, a = !1, u = null;
  const l = (c) => {
    try {
      return JSON.parse(c.data);
    } catch {
      return {};
    }
  }, f = () => {
    s = new r(i, { withCredentials: !0 }), s.onopen = () => {
      o = 0;
    }, s.addEventListener("connected", (c) => t.onConnected?.(l(c))), s.addEventListener("turn:start", (c) => t.onTurnStart?.(l(c))), s.addEventListener("turn:done", (c) => t.onTurnDone?.(l(c))), s.addEventListener("node:start", (c) => {
      const p = l(c);
      t.onNode?.(p.node, "start", p);
    }), s.addEventListener("node:done", (c) => {
      const p = l(c);
      t.onNode?.(p.node, "done", p);
    }), s.onerror = () => {
      if (a) return;
      try {
        s.close();
      } catch {
      }
      if (o >= fa) {
        t.onError?.(new Z("SSE_DISCONNECT", "Lost progress stream"));
        return;
      }
      o += 1;
      const c = Math.min(1e3 * 2 ** (o - 1), 8e3);
      u = setTimeout(() => {
        a || f();
      }, c);
    };
  };
  return f(), function() {
    a = !0, u && clearTimeout(u);
    try {
      s && s.close();
    } catch {
    }
  };
}
const Oe = { sendMessage: da, getDraft: Hi, patchDraft: pa, subscribeProgress: ga, getSchema: ha };
let Pe = { sessionId: null, unsub: null };
function rn(e, t, n) {
  if (Pe.sessionId === e && Pe.unsub) return;
  if (Pe.unsub)
    try {
      Pe.unsub();
    } catch {
    }
  const r = Oe.subscribeProgress(e, {
    onNode: (i, s) => t(s === "start" ? i : null),
    onTurnDone: () => n()
  });
  Pe = { sessionId: e, unsub: r };
}
function zr() {
  if (Pe.unsub)
    try {
      Pe.unsub();
    } catch {
    }
  Pe = { sessionId: null, unsub: null };
}
let Mr = 0;
function ma(e, t, n) {
  return Mr += 1, { id: `m${Date.now()}_${Mr}`, role: e, content: t, timestamp: (/* @__PURE__ */ new Date()).toISOString(), metadata: n || null };
}
function sn(e) {
  return {
    choices: e.choices || null,
    // controls[] (I-3): the typed turn-contract; ControlRenderer prefers it, falling
    // back to resolveChoices during the deprecation window.
    controls: Array.isArray(e.controls) ? e.controls : null,
    responseType: e.responseType || "text",
    preamble: e.preamble || null,
    resolveChoices: e.resolveChoices || null,
    executionLog: e.executionLog || null,
    srNumber: e.spawnResult?.requestId || e.state?.srNumber || null,
    isComplete: !!e.isComplete,
    // Chat-agent read intents: structured payloads a host chrome may render richly.
    ...Array.isArray(e.tickets) ? { tickets: e.tickets, totalCount: e.totalCount } : {},
    ...Array.isArray(e.breadcrumb) ? { breadcrumb: e.breadcrumb } : {}
  };
}
function ya() {
  return `fdv2-${typeof crypto < "u" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}
const on = () => ({ id: ya(), serviceId: null, schemaVersion: null, status: "idle" }), ft = () => ({ slots: {}, beneficiary: null, patches: [] }), an = () => ({ loading: !1, error: null, currentNode: null, composerDisabled: !1, draftPanelOpen: !0 }), _e = ia(
  oa(
    (e, t) => ({
      session: on(),
      messages: [],
      draft: ft(),
      schema: null,
      // compiled SchemaSnapshot for the active service (labels/phases/dependsOn)
      user: null,
      // the current user profile (from the host) — identity + greeting
      ui: an(),
      actions: {
        /** Append a message (any role). Returns the created message. */
        addMessage: (n, r, i) => {
          const s = ma(n, r, i);
          return e((o) => ({ messages: [...o.messages, s] })), s;
        },
        /**
         * Set the current user profile (host prop). Seeds a personalized greeting on
         * first set when the thread is empty. Idempotent for the same userId.
         */
        setUser: (n) => {
          !n || !n.userId || t().user && t().user.userId === n.userId || (e(() => ({ user: n })), t().messages.length === 0 && t().actions.seedGreeting());
        },
        /** Seed the first assistant message: greeting by FIRST name, in the selected language. */
        seedGreeting: () => {
          const n = t().user;
          if (!n || t().messages.length > 0) return;
          const r = n.firstName || (n.displayName ? String(n.displayName).split(/\s+/)[0] : "") || n.name || "", i = Ce.t("greeting", { name: r });
          t().actions.addMessage("assistant", i, { responseType: "greeting" });
        },
        /** Send a turn: optimistic user message → SSE progress + POST → assistant
         *  reply + draft refresh. SSE stays open across turns for the session. */
        sendMessage: async (n, r, i) => {
          const s = (n || "").trim();
          if (!s || t().ui.loading) return;
          const { actions: o } = t(), a = t().session.id, u = t().user?.userId || r || Ue().userId;
          o.addMessage("user", s), e((l) => ({ ui: { ...l.ui, loading: !0, error: null, currentNode: null } })), rn(a, o.setCurrentNode, () => o.setCurrentNode(null));
          try {
            const l = await Oe.sendMessage(a, u, s, { signal: i, lang: Mt(), userContext: t().user || void 0 });
            o.addMessage("assistant", l.response, sn(l)), l.draft && o.updateDraft(l.draft), o.applyTurnResult(l);
            const f = l?.state?.serviceId;
            if (f && t().schema?.serviceId !== f)
              try {
                const c = await Oe.getSchema(f);
                c && e(() => ({ schema: c }));
              } catch {
              }
          } catch (l) {
            if (i?.aborted) {
              e((c) => ({ ui: { ...c.ui, loading: !1, currentNode: null } })), o.addMessage("system", Ce.t("stopped"));
              return;
            }
            const f = l instanceof Z ? l : new Z("SERVER", l.message);
            o.setError({ code: f.code, message: f.message }), o.addMessage("system", `⚠️ ${f.message}`);
          }
        },
        /** Send a structured confirm-or-choose selection (F9.1f). */
        sendChoice: async (n, r, i) => {
          if (t().ui.loading) return;
          const { actions: s } = t(), o = t().session.id, a = t().user?.userId || i || Ue().userId;
          s.addMessage("user", r || n.value || Ce.t("choice.yes")), e((u) => ({ ui: { ...u.ui, loading: !0, error: null, currentNode: null } })), rn(o, s.setCurrentNode, () => s.setCurrentNode(null));
          try {
            const u = await Oe.sendMessage(o, a, null, { choice: n, lang: Mt(), userContext: t().user || void 0 });
            s.addMessage("assistant", u.response, sn(u)), u.draft && s.updateDraft(u.draft), s.applyTurnResult(u);
            const l = u?.state?.serviceId;
            if (l && t().schema?.serviceId !== l)
              try {
                const f = await Oe.getSchema(l);
                f && e(() => ({ schema: f }));
              } catch {
              }
          } catch (u) {
            const l = u instanceof Z ? u : new Z("SERVER", u.message);
            s.setError({ code: l.code, message: l.message }), s.addMessage("system", `⚠️ ${l.message}`);
          }
        },
        /** Send a controls[] reply (I-3). Mirrors sendChoice; POSTs {controlAction}. */
        sendControlAction: async (n, r, i) => {
          if (t().ui.loading) return;
          const { actions: s } = t(), o = t().session.id, a = t().user?.userId || i || Ue().userId;
          s.addMessage("user", r || n.value || Ce.t("choice.yes")), e((u) => ({ ui: { ...u.ui, loading: !0, error: null, currentNode: null } })), rn(o, s.setCurrentNode, () => s.setCurrentNode(null));
          try {
            const u = await Oe.sendMessage(o, a, null, { controlAction: n, lang: Mt(), userContext: t().user || void 0 });
            s.addMessage("assistant", u.response, sn(u)), u.draft && s.updateDraft(u.draft), s.applyTurnResult(u);
            const l = u?.state?.serviceId;
            if (l && t().schema?.serviceId !== l)
              try {
                const f = await Oe.getSchema(l);
                f && e(() => ({ schema: f }));
              } catch {
              }
          } catch (u) {
            const l = u instanceof Z ? u : new Z("SERVER", u.message);
            s.setError({ code: l.code, message: l.message }), s.addMessage("system", `⚠️ ${l.message}`);
          }
        },
        startSession: (n = null) => {
          zr(), e(() => ({
            session: { ...on(), serviceId: n },
            messages: [],
            draft: ft(),
            schema: null,
            ui: an()
          })), t().actions.seedGreeting();
        },
        resetSession: () => {
          zr(), e(() => ({ session: on(), messages: [], draft: ft(), schema: null, ui: an() })), t().actions.seedGreeting();
        },
        /** Merge a server turn result into session + draft. */
        applyTurnResult: (n) => {
          e((i) => ({
            session: {
              ...i.session,
              serviceId: n?.state?.serviceId ?? i.session.serviceId,
              status: n?.state?.status ?? (n?.isComplete ? "submitted" : "active")
            },
            ui: { ...i.ui, loading: !1, currentNode: null }
          }));
          const r = n?.spawnResult?.requestId || n?.state?.srNumber || null;
          r && Fr("onSubmitted", { srNumber: r, sessionId: t().session.id, serviceId: t().session.serviceId, result: n });
        },
        updateDraft: (n) => e(() => ({ draft: { ...ft(), ...n || {} } })),
        /** Inline slot edit from the DraftPanel: optimistic → patchDraft → reconcile. */
        patchSlot: async (n, r) => {
          const i = t().session.id, s = t().draft;
          e((o) => ({ draft: { ...o.draft, slots: { ...o.draft.slots, [n]: { ...o.draft.slots[n] || {}, value: r, provenance: "user_edited", stale: !1 } } } }));
          try {
            const o = await Oe.patchDraft(i, [{ op: "set", slotId: n, value: r, provenance: "user_edited" }]);
            o && o.slots && e(() => ({ draft: { ...ft(), ...o } }));
          } catch (o) {
            e(() => ({ draft: s })), t().actions.setError({ code: o.code || "SERVER", message: o.message });
          }
        },
        setCurrentNode: (n) => e((r) => ({ ui: { ...r.ui, currentNode: n } })),
        setLoading: (n) => e((r) => ({ ui: { ...r.ui, loading: n } })),
        setError: (n) => {
          e((r) => ({ ui: { ...r.ui, error: n, loading: !1, currentNode: null } })), Fr("onError", n);
        },
        clearError: () => e((n) => ({ ui: { ...n.ui, error: null } })),
        toggleDraftPanel: () => e((n) => ({ ui: { ...n.ui, draftPanelOpen: !n.ui.draftPanelOpen } }))
      }
    }),
    {
      name: "fdv2-chat",
      storage: Ui(() => sessionStorage),
      // Persist ONLY the session id (thread continuity across refresh); no messages.
      partialize: (e) => ({ session: { id: e.session.id } }),
      merge: (e, t) => ({
        ...t,
        session: { ...t.session, id: e?.session?.id || t.session.id }
      })
    }
  )
), ba = () => _e((e) => e.messages), Vi = () => _e(Un((e) => e.session)), xa = () => _e(Un((e) => e.draft)), ka = () => _e((e) => e.schema), it = () => _e(Un((e) => e.ui)), Ge = () => _e((e) => e.actions);
function wa(e, t) {
  const n = {};
  return (e[e.length - 1] === "" ? [...e, ""] : e).join(
    (n.padRight ? " " : "") + "," + (n.padLeft === !1 ? "" : " ")
  ).trim();
}
const Sa = /^[$_\p{ID_Start}][$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, va = /^[$_\p{ID_Start}][-$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, Ca = {};
function jr(e, t) {
  return (Ca.jsx ? va : Sa).test(e);
}
const Ea = /[ \t\n\f\r]/g;
function Ia(e) {
  return typeof e == "object" ? e.type === "text" ? $r(e.value) : !1 : $r(e);
}
function $r(e) {
  return e.replace(Ea, "") === "";
}
class It {
  /**
   * @param {SchemaType['property']} property
   *   Property.
   * @param {SchemaType['normal']} normal
   *   Normal.
   * @param {Space | undefined} [space]
   *   Space.
   * @returns
   *   Schema.
   */
  constructor(t, n, r) {
    this.normal = n, this.property = t, r && (this.space = r);
  }
}
It.prototype.normal = {};
It.prototype.property = {};
It.prototype.space = void 0;
function qi(e, t) {
  const n = {}, r = {};
  for (const i of e)
    Object.assign(n, i.property), Object.assign(r, i.normal);
  return new It(n, r, t);
}
function Rn(e) {
  return e.toLowerCase();
}
class pe {
  /**
   * @param {string} property
   *   Property.
   * @param {string} attribute
   *   Attribute.
   * @returns
   *   Info.
   */
  constructor(t, n) {
    this.attribute = n, this.property = t;
  }
}
pe.prototype.attribute = "";
pe.prototype.booleanish = !1;
pe.prototype.boolean = !1;
pe.prototype.commaOrSpaceSeparated = !1;
pe.prototype.commaSeparated = !1;
pe.prototype.defined = !1;
pe.prototype.mustUseProperty = !1;
pe.prototype.number = !1;
pe.prototype.overloadedBoolean = !1;
pe.prototype.property = "";
pe.prototype.spaceSeparated = !1;
pe.prototype.space = void 0;
let Ta = 0;
const j = Je(), ee = Je(), On = Je(), T = Je(), J = Je(), He = Je(), ge = Je();
function Je() {
  return 2 ** ++Ta;
}
const Pn = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  boolean: j,
  booleanish: ee,
  commaOrSpaceSeparated: ge,
  commaSeparated: He,
  number: T,
  overloadedBoolean: On,
  spaceSeparated: J
}, Symbol.toStringTag, { value: "Module" })), ln = (
  /** @type {ReadonlyArray<keyof typeof types>} */
  Object.keys(Pn)
);
class Vn extends pe {
  /**
   * @constructor
   * @param {string} property
   *   Property.
   * @param {string} attribute
   *   Attribute.
   * @param {number | null | undefined} [mask]
   *   Mask.
   * @param {Space | undefined} [space]
   *   Space.
   * @returns
   *   Info.
   */
  constructor(t, n, r, i) {
    let s = -1;
    if (super(t, n), Br(this, "space", i), typeof r == "number")
      for (; ++s < ln.length; ) {
        const o = ln[s];
        Br(this, ln[s], (r & Pn[o]) === Pn[o]);
      }
  }
}
Vn.prototype.defined = !0;
function Br(e, t, n) {
  n && (e[t] = n);
}
function st(e) {
  const t = {}, n = {};
  for (const [r, i] of Object.entries(e.properties)) {
    const s = new Vn(
      r,
      e.transform(e.attributes || {}, r),
      i,
      e.space
    );
    e.mustUseProperty && e.mustUseProperty.includes(r) && (s.mustUseProperty = !0), t[r] = s, n[Rn(r)] = r, n[Rn(s.attribute)] = r;
  }
  return new It(t, n, e.space);
}
const Ki = st({
  properties: {
    ariaActiveDescendant: null,
    ariaAtomic: ee,
    ariaAutoComplete: null,
    ariaBusy: ee,
    ariaChecked: ee,
    ariaColCount: T,
    ariaColIndex: T,
    ariaColSpan: T,
    ariaControls: J,
    ariaCurrent: null,
    ariaDescribedBy: J,
    ariaDetails: null,
    ariaDisabled: ee,
    ariaDropEffect: J,
    ariaErrorMessage: null,
    ariaExpanded: ee,
    ariaFlowTo: J,
    ariaGrabbed: ee,
    ariaHasPopup: null,
    ariaHidden: ee,
    ariaInvalid: null,
    ariaKeyShortcuts: null,
    ariaLabel: null,
    ariaLabelledBy: J,
    ariaLevel: T,
    ariaLive: null,
    ariaModal: ee,
    ariaMultiLine: ee,
    ariaMultiSelectable: ee,
    ariaOrientation: null,
    ariaOwns: J,
    ariaPlaceholder: null,
    ariaPosInSet: T,
    ariaPressed: ee,
    ariaReadOnly: ee,
    ariaRelevant: null,
    ariaRequired: ee,
    ariaRoleDescription: J,
    ariaRowCount: T,
    ariaRowIndex: T,
    ariaRowSpan: T,
    ariaSelected: ee,
    ariaSetSize: T,
    ariaSort: null,
    ariaValueMax: T,
    ariaValueMin: T,
    ariaValueNow: T,
    ariaValueText: null,
    role: null
  },
  transform(e, t) {
    return t === "role" ? t : "aria-" + t.slice(4).toLowerCase();
  }
});
function Wi(e, t) {
  return t in e ? e[t] : t;
}
function Gi(e, t) {
  return Wi(e, t.toLowerCase());
}
const La = st({
  attributes: {
    acceptcharset: "accept-charset",
    classname: "class",
    htmlfor: "for",
    httpequiv: "http-equiv"
  },
  mustUseProperty: ["checked", "multiple", "muted", "selected"],
  properties: {
    // Standard Properties.
    abbr: null,
    accept: He,
    acceptCharset: J,
    accessKey: J,
    action: null,
    allow: null,
    allowFullScreen: j,
    allowPaymentRequest: j,
    allowUserMedia: j,
    alpha: j,
    alt: null,
    as: null,
    async: j,
    autoCapitalize: null,
    autoComplete: J,
    autoFocus: j,
    autoPlay: j,
    blocking: J,
    capture: null,
    charSet: null,
    checked: j,
    cite: null,
    className: J,
    closedBy: null,
    colorSpace: null,
    cols: T,
    colSpan: T,
    command: null,
    commandFor: null,
    content: null,
    contentEditable: ee,
    controls: j,
    controlsList: J,
    coords: T | He,
    crossOrigin: null,
    data: null,
    dateTime: null,
    decoding: null,
    default: j,
    defer: j,
    dir: null,
    dirName: null,
    disabled: j,
    download: On,
    draggable: ee,
    encType: null,
    enterKeyHint: null,
    fetchPriority: null,
    form: null,
    formAction: null,
    formEncType: null,
    formMethod: null,
    formNoValidate: j,
    formTarget: null,
    headers: J,
    height: T,
    hidden: On,
    high: T,
    href: null,
    hrefLang: null,
    htmlFor: J,
    httpEquiv: J,
    id: null,
    imageSizes: null,
    imageSrcSet: null,
    inert: j,
    inputMode: null,
    integrity: null,
    is: null,
    isMap: j,
    itemId: null,
    itemProp: J,
    itemRef: J,
    itemScope: j,
    itemType: J,
    kind: null,
    label: null,
    lang: null,
    language: null,
    list: null,
    loading: null,
    loop: j,
    low: T,
    manifest: null,
    max: null,
    maxLength: T,
    media: null,
    method: null,
    min: null,
    minLength: T,
    multiple: j,
    muted: j,
    name: null,
    nonce: null,
    noModule: j,
    noValidate: j,
    onAbort: null,
    onAfterPrint: null,
    onAuxClick: null,
    onBeforeMatch: null,
    onBeforePrint: null,
    onBeforeToggle: null,
    onBeforeUnload: null,
    onBlur: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onContextLost: null,
    onContextMenu: null,
    onContextRestored: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFormData: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLanguageChange: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadEnd: null,
    onLoadStart: null,
    onMessage: null,
    onMessageError: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRejectionHandled: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onScrollEnd: null,
    onSecurityPolicyViolation: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onSlotChange: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnhandledRejection: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onWheel: null,
    open: j,
    optimum: T,
    pattern: null,
    ping: J,
    placeholder: null,
    playsInline: j,
    popover: null,
    popoverTarget: null,
    popoverTargetAction: null,
    poster: null,
    preload: null,
    readOnly: j,
    referrerPolicy: null,
    rel: J,
    required: j,
    reversed: j,
    rows: T,
    rowSpan: T,
    sandbox: J,
    scope: null,
    scoped: j,
    seamless: j,
    selected: j,
    shadowRootClonable: j,
    shadowRootCustomElementRegistry: j,
    shadowRootDelegatesFocus: j,
    shadowRootMode: null,
    shadowRootSerializable: j,
    shape: null,
    size: T,
    sizes: null,
    slot: null,
    span: T,
    spellCheck: ee,
    src: null,
    srcDoc: null,
    srcLang: null,
    srcSet: null,
    start: T,
    step: null,
    style: null,
    tabIndex: T,
    target: null,
    title: null,
    translate: null,
    type: null,
    typeMustMatch: j,
    useMap: null,
    value: ee,
    width: T,
    wrap: null,
    writingSuggestions: null,
    // Legacy.
    // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
    align: null,
    // Several. Use CSS `text-align` instead,
    aLink: null,
    // `<body>`. Use CSS `a:active {color}` instead
    archive: J,
    // `<object>`. List of URIs to archives
    axis: null,
    // `<td>` and `<th>`. Use `scope` on `<th>`
    background: null,
    // `<body>`. Use CSS `background-image` instead
    bgColor: null,
    // `<body>` and table elements. Use CSS `background-color` instead
    border: T,
    // `<table>`. Use CSS `border-width` instead,
    borderColor: null,
    // `<table>`. Use CSS `border-color` instead,
    bottomMargin: T,
    // `<body>`
    cellPadding: null,
    // `<table>`
    cellSpacing: null,
    // `<table>`
    char: null,
    // Several table elements. When `align=char`, sets the character to align on
    charOff: null,
    // Several table elements. When `char`, offsets the alignment
    classId: null,
    // `<object>`
    clear: null,
    // `<br>`. Use CSS `clear` instead
    code: null,
    // `<object>`
    codeBase: null,
    // `<object>`
    codeType: null,
    // `<object>`
    color: null,
    // `<font>` and `<hr>`. Use CSS instead
    compact: j,
    // Lists. Use CSS to reduce space between items instead
    declare: j,
    // `<object>`
    event: null,
    // `<script>`
    face: null,
    // `<font>`. Use CSS instead
    frame: null,
    // `<table>`
    frameBorder: null,
    // `<iframe>`. Use CSS `border` instead
    hSpace: T,
    // `<img>` and `<object>`
    leftMargin: T,
    // `<body>`
    link: null,
    // `<body>`. Use CSS `a:link {color: *}` instead
    longDesc: null,
    // `<frame>`, `<iframe>`, and `<img>`. Use an `<a>`
    lowSrc: null,
    // `<img>`. Use a `<picture>`
    marginHeight: T,
    // `<body>`
    marginWidth: T,
    // `<body>`
    noResize: j,
    // `<frame>`
    noHref: j,
    // `<area>`. Use no href instead of an explicit `nohref`
    noShade: j,
    // `<hr>`. Use background-color and height instead of borders
    noWrap: j,
    // `<td>` and `<th>`
    object: null,
    // `<applet>`
    profile: null,
    // `<head>`
    prompt: null,
    // `<isindex>`
    rev: null,
    // `<link>`
    rightMargin: T,
    // `<body>`
    rules: null,
    // `<table>`
    scheme: null,
    // `<meta>`
    scrolling: ee,
    // `<frame>`. Use overflow in the child context
    standby: null,
    // `<object>`
    summary: null,
    // `<table>`
    text: null,
    // `<body>`. Use CSS `color` instead
    topMargin: T,
    // `<body>`
    valueType: null,
    // `<param>`
    version: null,
    // `<html>`. Use a doctype.
    vAlign: null,
    // Several. Use CSS `vertical-align` instead
    vLink: null,
    // `<body>`. Use CSS `a:visited {color}` instead
    vSpace: T,
    // `<img>` and `<object>`
    // Non-standard Properties.
    allowTransparency: null,
    autoCorrect: null,
    autoSave: null,
    credentialless: j,
    disablePictureInPicture: j,
    disableRemotePlayback: j,
    exportParts: He,
    part: J,
    prefix: null,
    property: null,
    results: T,
    security: null,
    unselectable: null
  },
  space: "html",
  transform: Gi
}), Na = st({
  attributes: {
    accentHeight: "accent-height",
    alignmentBaseline: "alignment-baseline",
    arabicForm: "arabic-form",
    baselineShift: "baseline-shift",
    capHeight: "cap-height",
    className: "class",
    clipPath: "clip-path",
    clipRule: "clip-rule",
    colorInterpolation: "color-interpolation",
    colorInterpolationFilters: "color-interpolation-filters",
    colorProfile: "color-profile",
    colorRendering: "color-rendering",
    crossOrigin: "crossorigin",
    dataType: "datatype",
    dominantBaseline: "dominant-baseline",
    enableBackground: "enable-background",
    fillOpacity: "fill-opacity",
    fillRule: "fill-rule",
    floodColor: "flood-color",
    floodOpacity: "flood-opacity",
    fontFamily: "font-family",
    fontSize: "font-size",
    fontSizeAdjust: "font-size-adjust",
    fontStretch: "font-stretch",
    fontStyle: "font-style",
    fontVariant: "font-variant",
    fontWeight: "font-weight",
    glyphName: "glyph-name",
    glyphOrientationHorizontal: "glyph-orientation-horizontal",
    glyphOrientationVertical: "glyph-orientation-vertical",
    hrefLang: "hreflang",
    horizAdvX: "horiz-adv-x",
    horizOriginX: "horiz-origin-x",
    horizOriginY: "horiz-origin-y",
    imageRendering: "image-rendering",
    letterSpacing: "letter-spacing",
    lightingColor: "lighting-color",
    markerEnd: "marker-end",
    markerMid: "marker-mid",
    markerStart: "marker-start",
    maskType: "mask-type",
    navDown: "nav-down",
    navDownLeft: "nav-down-left",
    navDownRight: "nav-down-right",
    navLeft: "nav-left",
    navNext: "nav-next",
    navPrev: "nav-prev",
    navRight: "nav-right",
    navUp: "nav-up",
    navUpLeft: "nav-up-left",
    navUpRight: "nav-up-right",
    onAbort: "onabort",
    onActivate: "onactivate",
    onAfterPrint: "onafterprint",
    onBeforePrint: "onbeforeprint",
    onBegin: "onbegin",
    onCancel: "oncancel",
    onCanPlay: "oncanplay",
    onCanPlayThrough: "oncanplaythrough",
    onChange: "onchange",
    onClick: "onclick",
    onClose: "onclose",
    onCopy: "oncopy",
    onCueChange: "oncuechange",
    onCut: "oncut",
    onDblClick: "ondblclick",
    onDrag: "ondrag",
    onDragEnd: "ondragend",
    onDragEnter: "ondragenter",
    onDragExit: "ondragexit",
    onDragLeave: "ondragleave",
    onDragOver: "ondragover",
    onDragStart: "ondragstart",
    onDrop: "ondrop",
    onDurationChange: "ondurationchange",
    onEmptied: "onemptied",
    onEnd: "onend",
    onEnded: "onended",
    onError: "onerror",
    onFocus: "onfocus",
    onFocusIn: "onfocusin",
    onFocusOut: "onfocusout",
    onHashChange: "onhashchange",
    onInput: "oninput",
    onInvalid: "oninvalid",
    onKeyDown: "onkeydown",
    onKeyPress: "onkeypress",
    onKeyUp: "onkeyup",
    onLoad: "onload",
    onLoadedData: "onloadeddata",
    onLoadedMetadata: "onloadedmetadata",
    onLoadStart: "onloadstart",
    onMessage: "onmessage",
    onMouseDown: "onmousedown",
    onMouseEnter: "onmouseenter",
    onMouseLeave: "onmouseleave",
    onMouseMove: "onmousemove",
    onMouseOut: "onmouseout",
    onMouseOver: "onmouseover",
    onMouseUp: "onmouseup",
    onMouseWheel: "onmousewheel",
    onOffline: "onoffline",
    onOnline: "ononline",
    onPageHide: "onpagehide",
    onPageShow: "onpageshow",
    onPaste: "onpaste",
    onPause: "onpause",
    onPlay: "onplay",
    onPlaying: "onplaying",
    onPopState: "onpopstate",
    onProgress: "onprogress",
    onRateChange: "onratechange",
    onRepeat: "onrepeat",
    onReset: "onreset",
    onResize: "onresize",
    onScroll: "onscroll",
    onSeeked: "onseeked",
    onSeeking: "onseeking",
    onSelect: "onselect",
    onShow: "onshow",
    onStalled: "onstalled",
    onStorage: "onstorage",
    onSubmit: "onsubmit",
    onSuspend: "onsuspend",
    onTimeUpdate: "ontimeupdate",
    onToggle: "ontoggle",
    onUnload: "onunload",
    onVolumeChange: "onvolumechange",
    onWaiting: "onwaiting",
    onZoom: "onzoom",
    overlinePosition: "overline-position",
    overlineThickness: "overline-thickness",
    paintOrder: "paint-order",
    panose1: "panose-1",
    pointerEvents: "pointer-events",
    referrerPolicy: "referrerpolicy",
    renderingIntent: "rendering-intent",
    shapeRendering: "shape-rendering",
    stopColor: "stop-color",
    stopOpacity: "stop-opacity",
    strikethroughPosition: "strikethrough-position",
    strikethroughThickness: "strikethrough-thickness",
    strokeDashArray: "stroke-dasharray",
    strokeDashOffset: "stroke-dashoffset",
    strokeLineCap: "stroke-linecap",
    strokeLineJoin: "stroke-linejoin",
    strokeMiterLimit: "stroke-miterlimit",
    strokeOpacity: "stroke-opacity",
    strokeWidth: "stroke-width",
    tabIndex: "tabindex",
    textAnchor: "text-anchor",
    textDecoration: "text-decoration",
    textRendering: "text-rendering",
    transformOrigin: "transform-origin",
    typeOf: "typeof",
    underlinePosition: "underline-position",
    underlineThickness: "underline-thickness",
    unicodeBidi: "unicode-bidi",
    unicodeRange: "unicode-range",
    unitsPerEm: "units-per-em",
    vAlphabetic: "v-alphabetic",
    vHanging: "v-hanging",
    vIdeographic: "v-ideographic",
    vMathematical: "v-mathematical",
    vectorEffect: "vector-effect",
    vertAdvY: "vert-adv-y",
    vertOriginX: "vert-origin-x",
    vertOriginY: "vert-origin-y",
    wordSpacing: "word-spacing",
    writingMode: "writing-mode",
    xHeight: "x-height",
    // These were camelcased in Tiny. Now lowercased in SVG 2
    playbackOrder: "playbackorder",
    timelineBegin: "timelinebegin"
  },
  properties: {
    about: ge,
    accentHeight: T,
    accumulate: null,
    additive: null,
    alignmentBaseline: null,
    alphabetic: T,
    amplitude: T,
    arabicForm: null,
    ascent: T,
    attributeName: null,
    attributeType: null,
    azimuth: T,
    bandwidth: null,
    baselineShift: null,
    baseFrequency: null,
    baseProfile: null,
    bbox: null,
    begin: null,
    bias: T,
    by: null,
    calcMode: null,
    capHeight: T,
    className: J,
    clip: null,
    clipPath: null,
    clipPathUnits: null,
    clipRule: null,
    color: null,
    colorInterpolation: null,
    colorInterpolationFilters: null,
    colorProfile: null,
    colorRendering: null,
    content: null,
    contentScriptType: null,
    contentStyleType: null,
    crossOrigin: null,
    cursor: null,
    cx: null,
    cy: null,
    d: null,
    dataType: null,
    defaultAction: null,
    descent: T,
    diffuseConstant: T,
    direction: null,
    display: null,
    dur: null,
    divisor: T,
    dominantBaseline: null,
    download: j,
    dx: null,
    dy: null,
    edgeMode: null,
    editable: null,
    elevation: T,
    enableBackground: null,
    end: null,
    event: null,
    exponent: T,
    externalResourcesRequired: null,
    fill: null,
    fillOpacity: T,
    fillRule: null,
    filter: null,
    filterRes: null,
    filterUnits: null,
    floodColor: null,
    floodOpacity: null,
    focusable: null,
    focusHighlight: null,
    fontFamily: null,
    fontSize: null,
    fontSizeAdjust: null,
    fontStretch: null,
    fontStyle: null,
    fontVariant: null,
    fontWeight: null,
    format: null,
    fr: null,
    from: null,
    fx: null,
    fy: null,
    g1: He,
    g2: He,
    glyphName: He,
    glyphOrientationHorizontal: null,
    glyphOrientationVertical: null,
    glyphRef: null,
    gradientTransform: null,
    gradientUnits: null,
    handler: null,
    hanging: T,
    hatchContentUnits: null,
    hatchUnits: null,
    height: null,
    href: null,
    hrefLang: null,
    horizAdvX: T,
    horizOriginX: T,
    horizOriginY: T,
    id: null,
    ideographic: T,
    imageRendering: null,
    initialVisibility: null,
    in: null,
    in2: null,
    intercept: T,
    k: T,
    k1: T,
    k2: T,
    k3: T,
    k4: T,
    kernelMatrix: ge,
    kernelUnitLength: null,
    keyPoints: null,
    // SEMI_COLON_SEPARATED
    keySplines: null,
    // SEMI_COLON_SEPARATED
    keyTimes: null,
    // SEMI_COLON_SEPARATED
    kerning: null,
    lang: null,
    lengthAdjust: null,
    letterSpacing: null,
    lightingColor: null,
    limitingConeAngle: T,
    local: null,
    markerEnd: null,
    markerMid: null,
    markerStart: null,
    markerHeight: null,
    markerUnits: null,
    markerWidth: null,
    mask: null,
    maskContentUnits: null,
    maskType: null,
    maskUnits: null,
    mathematical: null,
    max: null,
    media: null,
    mediaCharacterEncoding: null,
    mediaContentEncodings: null,
    mediaSize: T,
    mediaTime: null,
    method: null,
    min: null,
    mode: null,
    name: null,
    navDown: null,
    navDownLeft: null,
    navDownRight: null,
    navLeft: null,
    navNext: null,
    navPrev: null,
    navRight: null,
    navUp: null,
    navUpLeft: null,
    navUpRight: null,
    numOctaves: null,
    observer: null,
    offset: null,
    onAbort: null,
    onActivate: null,
    onAfterPrint: null,
    onBeforePrint: null,
    onBegin: null,
    onCancel: null,
    onCanPlay: null,
    onCanPlayThrough: null,
    onChange: null,
    onClick: null,
    onClose: null,
    onCopy: null,
    onCueChange: null,
    onCut: null,
    onDblClick: null,
    onDrag: null,
    onDragEnd: null,
    onDragEnter: null,
    onDragExit: null,
    onDragLeave: null,
    onDragOver: null,
    onDragStart: null,
    onDrop: null,
    onDurationChange: null,
    onEmptied: null,
    onEnd: null,
    onEnded: null,
    onError: null,
    onFocus: null,
    onFocusIn: null,
    onFocusOut: null,
    onHashChange: null,
    onInput: null,
    onInvalid: null,
    onKeyDown: null,
    onKeyPress: null,
    onKeyUp: null,
    onLoad: null,
    onLoadedData: null,
    onLoadedMetadata: null,
    onLoadStart: null,
    onMessage: null,
    onMouseDown: null,
    onMouseEnter: null,
    onMouseLeave: null,
    onMouseMove: null,
    onMouseOut: null,
    onMouseOver: null,
    onMouseUp: null,
    onMouseWheel: null,
    onOffline: null,
    onOnline: null,
    onPageHide: null,
    onPageShow: null,
    onPaste: null,
    onPause: null,
    onPlay: null,
    onPlaying: null,
    onPopState: null,
    onProgress: null,
    onRateChange: null,
    onRepeat: null,
    onReset: null,
    onResize: null,
    onScroll: null,
    onSeeked: null,
    onSeeking: null,
    onSelect: null,
    onShow: null,
    onStalled: null,
    onStorage: null,
    onSubmit: null,
    onSuspend: null,
    onTimeUpdate: null,
    onToggle: null,
    onUnload: null,
    onVolumeChange: null,
    onWaiting: null,
    onZoom: null,
    opacity: null,
    operator: null,
    order: null,
    orient: null,
    orientation: null,
    origin: null,
    overflow: null,
    overlay: null,
    overlinePosition: T,
    overlineThickness: T,
    paintOrder: null,
    panose1: null,
    path: null,
    pathLength: T,
    patternContentUnits: null,
    patternTransform: null,
    patternUnits: null,
    phase: null,
    ping: J,
    pitch: null,
    playbackOrder: null,
    pointerEvents: null,
    points: null,
    pointsAtX: T,
    pointsAtY: T,
    pointsAtZ: T,
    preserveAlpha: null,
    preserveAspectRatio: null,
    primitiveUnits: null,
    propagate: null,
    property: ge,
    r: null,
    radius: null,
    referrerPolicy: null,
    refX: null,
    refY: null,
    rel: ge,
    rev: ge,
    renderingIntent: null,
    repeatCount: null,
    repeatDur: null,
    requiredExtensions: ge,
    requiredFeatures: ge,
    requiredFonts: ge,
    requiredFormats: ge,
    resource: null,
    restart: null,
    result: null,
    rotate: null,
    rx: null,
    ry: null,
    scale: null,
    seed: null,
    shapeRendering: null,
    side: null,
    slope: null,
    snapshotTime: null,
    specularConstant: T,
    specularExponent: T,
    spreadMethod: null,
    spacing: null,
    startOffset: null,
    stdDeviation: null,
    stemh: null,
    stemv: null,
    stitchTiles: null,
    stopColor: null,
    stopOpacity: null,
    strikethroughPosition: T,
    strikethroughThickness: T,
    string: null,
    stroke: null,
    strokeDashArray: ge,
    strokeDashOffset: null,
    strokeLineCap: null,
    strokeLineJoin: null,
    strokeMiterLimit: T,
    strokeOpacity: T,
    strokeWidth: null,
    style: null,
    surfaceScale: T,
    syncBehavior: null,
    syncBehaviorDefault: null,
    syncMaster: null,
    syncTolerance: null,
    syncToleranceDefault: null,
    systemLanguage: ge,
    tabIndex: T,
    tableValues: null,
    target: null,
    targetX: T,
    targetY: T,
    textAnchor: null,
    textDecoration: null,
    textRendering: null,
    textLength: null,
    timelineBegin: null,
    title: null,
    transformBehavior: null,
    type: null,
    typeOf: ge,
    to: null,
    transform: null,
    transformOrigin: null,
    u1: null,
    u2: null,
    underlinePosition: T,
    underlineThickness: T,
    unicode: null,
    unicodeBidi: null,
    unicodeRange: null,
    unitsPerEm: T,
    values: null,
    vAlphabetic: T,
    vMathematical: T,
    vectorEffect: null,
    vHanging: T,
    vIdeographic: T,
    version: null,
    vertAdvY: T,
    vertOriginX: T,
    vertOriginY: T,
    viewBox: null,
    viewTarget: null,
    visibility: null,
    width: null,
    widths: null,
    wordSpacing: null,
    writingMode: null,
    x: null,
    x1: null,
    x2: null,
    xChannelSelector: null,
    xHeight: T,
    y: null,
    y1: null,
    y2: null,
    yChannelSelector: null,
    z: null,
    zoomAndPan: null
  },
  space: "svg",
  transform: Wi
}), Ji = st({
  properties: {
    xLinkActuate: null,
    xLinkArcRole: null,
    xLinkHref: null,
    xLinkRole: null,
    xLinkShow: null,
    xLinkTitle: null,
    xLinkType: null
  },
  space: "xlink",
  transform(e, t) {
    return "xlink:" + t.slice(5).toLowerCase();
  }
}), Yi = st({
  attributes: { xmlnsxlink: "xmlns:xlink" },
  properties: { xmlnsXLink: null, xmlns: null },
  space: "xmlns",
  transform: Gi
}), Qi = st({
  properties: { xmlBase: null, xmlLang: null, xmlSpace: null },
  space: "xml",
  transform(e, t) {
    return "xml:" + t.slice(3).toLowerCase();
  }
}), Aa = {
  classId: "classID",
  dataType: "datatype",
  itemId: "itemID",
  strokeDashArray: "strokeDasharray",
  strokeDashOffset: "strokeDashoffset",
  strokeLineCap: "strokeLinecap",
  strokeLineJoin: "strokeLinejoin",
  strokeMiterLimit: "strokeMiterlimit",
  typeOf: "typeof",
  xLinkActuate: "xlinkActuate",
  xLinkArcRole: "xlinkArcrole",
  xLinkHref: "xlinkHref",
  xLinkRole: "xlinkRole",
  xLinkShow: "xlinkShow",
  xLinkTitle: "xlinkTitle",
  xLinkType: "xlinkType",
  xmlnsXLink: "xmlnsXlink"
}, Ra = /[A-Z]/g, Ur = /-[a-z]/g, Oa = /^data[-\w.:]+$/i;
function Pa(e, t) {
  const n = Rn(t);
  let r = t, i = pe;
  if (n in e.normal)
    return e.property[e.normal[n]];
  if (n.length > 4 && n.slice(0, 4) === "data" && Oa.test(t)) {
    if (t.charAt(4) === "-") {
      const s = t.slice(5).replace(Ur, _a);
      r = "data" + s.charAt(0).toUpperCase() + s.slice(1);
    } else {
      const s = t.slice(4);
      if (!Ur.test(s)) {
        let o = s.replace(Ra, Da);
        o.charAt(0) !== "-" && (o = "-" + o), t = "data" + o;
      }
    }
    i = Vn;
  }
  return new i(r, t);
}
function Da(e) {
  return "-" + e.toLowerCase();
}
function _a(e) {
  return e.charAt(1).toUpperCase();
}
const Fa = qi([Ki, La, Ji, Yi, Qi], "html"), qn = qi([Ki, Na, Ji, Yi, Qi], "svg");
function za(e) {
  return e.join(" ").trim();
}
var Ze = {}, un, Hr;
function Ma() {
  if (Hr) return un;
  Hr = 1;
  var e = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, t = /\n/g, n = /^\s*/, r = /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/, i = /^:\s*/, s = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/, o = /^[;\s]*/, a = /^\s+|\s+$/g, u = `
`, l = "/", f = "*", c = "", p = "comment", h = "declaration";
  function d(x, b) {
    if (typeof x != "string")
      throw new TypeError("First argument must be a string");
    if (!x) return [];
    b = b || {};
    var v = 1, w = 1;
    function I(P) {
      var A = P.match(t);
      A && (v += A.length);
      var U = P.lastIndexOf(u);
      w = ~U ? P.length - U : w + P.length;
    }
    function O() {
      var P = { line: v, column: w };
      return function(A) {
        return A.position = new S(P), D(), A;
      };
    }
    function S(P) {
      this.start = P, this.end = { line: v, column: w }, this.source = b.source;
    }
    S.prototype.content = x;
    function z(P) {
      var A = new Error(
        b.source + ":" + v + ":" + w + ": " + P
      );
      if (A.reason = P, A.filename = b.source, A.line = v, A.column = w, A.source = x, !b.silent) throw A;
    }
    function V(P) {
      var A = P.exec(x);
      if (A) {
        var U = A[0];
        return I(U), x = x.slice(U.length), A;
      }
    }
    function D() {
      V(n);
    }
    function k(P) {
      var A;
      for (P = P || []; A = L(); )
        A !== !1 && P.push(A);
      return P;
    }
    function L() {
      var P = O();
      if (!(l != x.charAt(0) || f != x.charAt(1))) {
        for (var A = 2; c != x.charAt(A) && (f != x.charAt(A) || l != x.charAt(A + 1)); )
          ++A;
        if (A += 2, c === x.charAt(A - 1))
          return z("End of comment missing");
        var U = x.slice(2, A - 2);
        return w += 2, I(U), x = x.slice(A), w += 2, P({
          type: p,
          comment: U
        });
      }
    }
    function R() {
      var P = O(), A = V(r);
      if (A) {
        if (L(), !V(i)) return z("property missing ':'");
        var U = V(s), W = P({
          type: h,
          property: y(A[0].replace(e, c)),
          value: U ? y(U[0].replace(e, c)) : c
        });
        return V(o), W;
      }
    }
    function _() {
      var P = [];
      k(P);
      for (var A; A = R(); )
        A !== !1 && (P.push(A), k(P));
      return P;
    }
    return D(), _();
  }
  function y(x) {
    return x ? x.replace(a, c) : c;
  }
  return un = d, un;
}
var Vr;
function ja() {
  if (Vr) return Ze;
  Vr = 1;
  var e = Ze && Ze.__importDefault || function(r) {
    return r && r.__esModule ? r : { default: r };
  };
  Object.defineProperty(Ze, "__esModule", { value: !0 }), Ze.default = n;
  const t = e(Ma());
  function n(r, i) {
    let s = null;
    if (!r || typeof r != "string")
      return s;
    const o = (0, t.default)(r), a = typeof i == "function";
    return o.forEach((u) => {
      if (u.type !== "declaration")
        return;
      const { property: l, value: f } = u;
      a ? i(l, f, u) : f && (s = s || {}, s[l] = f);
    }), s;
  }
  return Ze;
}
var ht = {}, qr;
function $a() {
  if (qr) return ht;
  qr = 1, Object.defineProperty(ht, "__esModule", { value: !0 }), ht.camelCase = void 0;
  var e = /^--[a-zA-Z0-9_-]+$/, t = /-([a-z])/g, n = /^[^-]+$/, r = /^-(webkit|moz|ms|o|khtml)-/, i = /^-(ms)-/, s = function(l) {
    return !l || n.test(l) || e.test(l);
  }, o = function(l, f) {
    return f.toUpperCase();
  }, a = function(l, f) {
    return "".concat(f, "-");
  }, u = function(l, f) {
    return f === void 0 && (f = {}), s(l) ? l : (l = l.toLowerCase(), f.reactCompat ? l = l.replace(i, a) : l = l.replace(r, a), l.replace(t, o));
  };
  return ht.camelCase = u, ht;
}
var pt, Kr;
function Ba() {
  if (Kr) return pt;
  Kr = 1;
  var e = pt && pt.__importDefault || function(i) {
    return i && i.__esModule ? i : { default: i };
  }, t = e(ja()), n = $a();
  function r(i, s) {
    var o = {};
    return !i || typeof i != "string" || (0, t.default)(i, function(a, u) {
      a && u && (o[(0, n.camelCase)(a, s)] = u);
    }), o;
  }
  return r.default = r, pt = r, pt;
}
var Ua = Ba();
const Ha = /* @__PURE__ */ Fi(Ua), Xi = Zi("end"), Kn = Zi("start");
function Zi(e) {
  return t;
  function t(n) {
    const r = n && n.position && n.position[e] || {};
    if (typeof r.line == "number" && r.line > 0 && typeof r.column == "number" && r.column > 0)
      return {
        line: r.line,
        column: r.column,
        offset: typeof r.offset == "number" && r.offset > -1 ? r.offset : void 0
      };
  }
}
function Va(e) {
  const t = Kn(e), n = Xi(e);
  if (t && n)
    return { start: t, end: n };
}
function xt(e) {
  return !e || typeof e != "object" ? "" : "position" in e || "type" in e ? Wr(e.position) : "start" in e || "end" in e ? Wr(e) : "line" in e || "column" in e ? Dn(e) : "";
}
function Dn(e) {
  return Gr(e && e.line) + ":" + Gr(e && e.column);
}
function Wr(e) {
  return Dn(e && e.start) + "-" + Dn(e && e.end);
}
function Gr(e) {
  return e && typeof e == "number" ? e : 1;
}
class se extends Error {
  /**
   * Create a message for `reason`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {Options | null | undefined} [options]
   * @returns
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | Options | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns
   *   Instance of `VFileMessage`.
   */
  // eslint-disable-next-line complexity
  constructor(t, n, r) {
    super(), typeof n == "string" && (r = n, n = void 0);
    let i = "", s = {}, o = !1;
    if (n && ("line" in n && "column" in n ? s = { place: n } : "start" in n && "end" in n ? s = { place: n } : "type" in n ? s = {
      ancestors: [n],
      place: n.position
    } : s = { ...n }), typeof t == "string" ? i = t : !s.cause && t && (o = !0, i = t.message, s.cause = t), !s.ruleId && !s.source && typeof r == "string") {
      const u = r.indexOf(":");
      u === -1 ? s.ruleId = r : (s.source = r.slice(0, u), s.ruleId = r.slice(u + 1));
    }
    if (!s.place && s.ancestors && s.ancestors) {
      const u = s.ancestors[s.ancestors.length - 1];
      u && (s.place = u.position);
    }
    const a = s.place && "start" in s.place ? s.place.start : s.place;
    this.ancestors = s.ancestors || void 0, this.cause = s.cause || void 0, this.column = a ? a.column : void 0, this.fatal = void 0, this.file = "", this.message = i, this.line = a ? a.line : void 0, this.name = xt(s.place) || "1:1", this.place = s.place || void 0, this.reason = this.message, this.ruleId = s.ruleId || void 0, this.source = s.source || void 0, this.stack = o && s.cause && typeof s.cause.stack == "string" ? s.cause.stack : "", this.actual = void 0, this.expected = void 0, this.note = void 0, this.url = void 0;
  }
}
se.prototype.file = "";
se.prototype.name = "";
se.prototype.reason = "";
se.prototype.message = "";
se.prototype.stack = "";
se.prototype.column = void 0;
se.prototype.line = void 0;
se.prototype.ancestors = void 0;
se.prototype.cause = void 0;
se.prototype.fatal = void 0;
se.prototype.place = void 0;
se.prototype.ruleId = void 0;
se.prototype.source = void 0;
const Wn = {}.hasOwnProperty, qa = /* @__PURE__ */ new Map(), Ka = /[A-Z]/g, Wa = /* @__PURE__ */ new Set(["table", "tbody", "thead", "tfoot", "tr"]), Ga = /* @__PURE__ */ new Set(["td", "th"]), es = "https://github.com/syntax-tree/hast-util-to-jsx-runtime";
function Ja(e, t) {
  if (!t || t.Fragment === void 0)
    throw new TypeError("Expected `Fragment` in options");
  const n = t.filePath || void 0;
  let r;
  if (t.development) {
    if (typeof t.jsxDEV != "function")
      throw new TypeError(
        "Expected `jsxDEV` in options when `development: true`"
      );
    r = rl(n, t.jsxDEV);
  } else {
    if (typeof t.jsx != "function")
      throw new TypeError("Expected `jsx` in production options");
    if (typeof t.jsxs != "function")
      throw new TypeError("Expected `jsxs` in production options");
    r = nl(n, t.jsx, t.jsxs);
  }
  const i = {
    Fragment: t.Fragment,
    ancestors: [],
    components: t.components || {},
    create: r,
    elementAttributeNameCase: t.elementAttributeNameCase || "react",
    evaluater: t.createEvaluater ? t.createEvaluater() : void 0,
    filePath: n,
    ignoreInvalidStyle: t.ignoreInvalidStyle || !1,
    passKeys: t.passKeys !== !1,
    passNode: t.passNode || !1,
    schema: t.space === "svg" ? qn : Fa,
    stylePropertyNameCase: t.stylePropertyNameCase || "dom",
    tableCellAlignToStyle: t.tableCellAlignToStyle !== !1
  }, s = ts(i, e, void 0);
  return s && typeof s != "string" ? s : i.create(
    e,
    i.Fragment,
    { children: s || void 0 },
    void 0
  );
}
function ts(e, t, n) {
  if (t.type === "element")
    return Ya(e, t, n);
  if (t.type === "mdxFlowExpression" || t.type === "mdxTextExpression")
    return Qa(e, t);
  if (t.type === "mdxJsxFlowElement" || t.type === "mdxJsxTextElement")
    return Za(e, t, n);
  if (t.type === "mdxjsEsm")
    return Xa(e, t);
  if (t.type === "root")
    return el(e, t, n);
  if (t.type === "text")
    return tl(e, t);
}
function Ya(e, t, n) {
  const r = e.schema;
  let i = r;
  t.tagName.toLowerCase() === "svg" && r.space === "html" && (i = qn, e.schema = i), e.ancestors.push(t);
  const s = rs(e, t.tagName, !1), o = il(e, t);
  let a = Jn(e, t);
  return Wa.has(t.tagName) && (a = a.filter(function(u) {
    return typeof u == "string" ? !Ia(u) : !0;
  })), ns(e, o, s, t), Gn(o, a), e.ancestors.pop(), e.schema = r, e.create(t, s, o, n);
}
function Qa(e, t) {
  if (t.data && t.data.estree && e.evaluater) {
    const r = t.data.estree.body[0];
    return r.type, /** @type {Child | undefined} */
    e.evaluater.evaluateExpression(r.expression);
  }
  vt(e, t.position);
}
function Xa(e, t) {
  if (t.data && t.data.estree && e.evaluater)
    return (
      /** @type {Child | undefined} */
      e.evaluater.evaluateProgram(t.data.estree)
    );
  vt(e, t.position);
}
function Za(e, t, n) {
  const r = e.schema;
  let i = r;
  t.name === "svg" && r.space === "html" && (i = qn, e.schema = i), e.ancestors.push(t);
  const s = t.name === null ? e.Fragment : rs(e, t.name, !0), o = sl(e, t), a = Jn(e, t);
  return ns(e, o, s, t), Gn(o, a), e.ancestors.pop(), e.schema = r, e.create(t, s, o, n);
}
function el(e, t, n) {
  const r = {};
  return Gn(r, Jn(e, t)), e.create(t, e.Fragment, r, n);
}
function tl(e, t) {
  return t.value;
}
function ns(e, t, n, r) {
  typeof n != "string" && n !== e.Fragment && e.passNode && (t.node = r);
}
function Gn(e, t) {
  if (t.length > 0) {
    const n = t.length > 1 ? t : t[0];
    n && (e.children = n);
  }
}
function nl(e, t, n) {
  return r;
  function r(i, s, o, a) {
    const l = Array.isArray(o.children) ? n : t;
    return a ? l(s, o, a) : l(s, o);
  }
}
function rl(e, t) {
  return n;
  function n(r, i, s, o) {
    const a = Array.isArray(s.children), u = Kn(r);
    return t(
      i,
      s,
      o,
      a,
      {
        columnNumber: u ? u.column - 1 : void 0,
        fileName: e,
        lineNumber: u ? u.line : void 0
      },
      void 0
    );
  }
}
function il(e, t) {
  const n = {};
  let r, i;
  for (i in t.properties)
    if (i !== "children" && Wn.call(t.properties, i)) {
      const s = ol(e, i, t.properties[i]);
      if (s) {
        const [o, a] = s;
        e.tableCellAlignToStyle && o === "align" && typeof a == "string" && Ga.has(t.tagName) ? r = a : n[o] = a;
      }
    }
  if (r) {
    const s = (
      /** @type {Style} */
      n.style || (n.style = {})
    );
    s[e.stylePropertyNameCase === "css" ? "text-align" : "textAlign"] = r;
  }
  return n;
}
function sl(e, t) {
  const n = {};
  for (const r of t.attributes)
    if (r.type === "mdxJsxExpressionAttribute")
      if (r.data && r.data.estree && e.evaluater) {
        const s = r.data.estree.body[0];
        s.type;
        const o = s.expression;
        o.type;
        const a = o.properties[0];
        a.type, Object.assign(
          n,
          e.evaluater.evaluateExpression(a.argument)
        );
      } else
        vt(e, t.position);
    else {
      const i = r.name;
      let s;
      if (r.value && typeof r.value == "object")
        if (r.value.data && r.value.data.estree && e.evaluater) {
          const a = r.value.data.estree.body[0];
          a.type, s = e.evaluater.evaluateExpression(a.expression);
        } else
          vt(e, t.position);
      else
        s = r.value === null ? !0 : r.value;
      n[i] = /** @type {Props[keyof Props]} */
      s;
    }
  return n;
}
function Jn(e, t) {
  const n = [];
  let r = -1;
  const i = e.passKeys ? /* @__PURE__ */ new Map() : qa;
  for (; ++r < t.children.length; ) {
    const s = t.children[r];
    let o;
    if (e.passKeys) {
      const u = s.type === "element" ? s.tagName : s.type === "mdxJsxFlowElement" || s.type === "mdxJsxTextElement" ? s.name : void 0;
      if (u) {
        const l = i.get(u) || 0;
        o = u + "-" + l, i.set(u, l + 1);
      }
    }
    const a = ts(e, s, o);
    a !== void 0 && n.push(a);
  }
  return n;
}
function ol(e, t, n) {
  const r = Pa(e.schema, t);
  if (!(n == null || typeof n == "number" && Number.isNaN(n))) {
    if (Array.isArray(n) && (n = r.commaSeparated ? wa(n) : za(n)), r.property === "style") {
      let i = typeof n == "object" ? n : al(e, String(n));
      return e.stylePropertyNameCase === "css" && (i = ll(i)), ["style", i];
    }
    return [
      e.elementAttributeNameCase === "react" && r.space ? Aa[r.property] || r.property : r.attribute,
      n
    ];
  }
}
function al(e, t) {
  try {
    return Ha(t, { reactCompat: !0 });
  } catch (n) {
    if (e.ignoreInvalidStyle)
      return {};
    const r = (
      /** @type {Error} */
      n
    ), i = new se("Cannot parse `style` attribute", {
      ancestors: e.ancestors,
      cause: r,
      ruleId: "style",
      source: "hast-util-to-jsx-runtime"
    });
    throw i.file = e.filePath || void 0, i.url = es + "#cannot-parse-style-attribute", i;
  }
}
function rs(e, t, n) {
  let r;
  if (!n)
    r = { type: "Literal", value: t };
  else if (t.includes(".")) {
    const i = t.split(".");
    let s = -1, o;
    for (; ++s < i.length; ) {
      const a = jr(i[s]) ? { type: "Identifier", name: i[s] } : { type: "Literal", value: i[s] };
      o = o ? {
        type: "MemberExpression",
        object: o,
        property: a,
        computed: !!(s && a.type === "Literal"),
        optional: !1
      } : a;
    }
    r = o;
  } else
    r = jr(t) && !/^[a-z]/.test(t) ? { type: "Identifier", name: t } : { type: "Literal", value: t };
  if (r.type === "Literal") {
    const i = (
      /** @type {string | number} */
      r.value
    );
    return Wn.call(e.components, i) ? e.components[i] : i;
  }
  if (e.evaluater)
    return e.evaluater.evaluateExpression(r);
  vt(e);
}
function vt(e, t) {
  const n = new se(
    "Cannot handle MDX estrees without `createEvaluater`",
    {
      ancestors: e.ancestors,
      place: t,
      ruleId: "mdx-estree",
      source: "hast-util-to-jsx-runtime"
    }
  );
  throw n.file = e.filePath || void 0, n.url = es + "#cannot-handle-mdx-estrees-without-createevaluater", n;
}
function ll(e) {
  const t = {};
  let n;
  for (n in e)
    Wn.call(e, n) && (t[ul(n)] = e[n]);
  return t;
}
function ul(e) {
  let t = e.replace(Ka, cl);
  return t.slice(0, 3) === "ms-" && (t = "-" + t), t;
}
function cl(e) {
  return "-" + e.toLowerCase();
}
const cn = {
  action: ["form"],
  cite: ["blockquote", "del", "ins", "q"],
  data: ["object"],
  formAction: ["button", "input"],
  href: ["a", "area", "base", "link"],
  icon: ["menuitem"],
  itemId: null,
  manifest: ["html"],
  ping: ["a", "area"],
  poster: ["video"],
  src: [
    "audio",
    "embed",
    "iframe",
    "img",
    "input",
    "script",
    "source",
    "track",
    "video"
  ]
}, fl = {};
function Yn(e, t) {
  const n = fl, r = typeof n.includeImageAlt == "boolean" ? n.includeImageAlt : !0, i = typeof n.includeHtml == "boolean" ? n.includeHtml : !0;
  return is(e, r, i);
}
function is(e, t, n) {
  if (hl(e)) {
    if ("value" in e)
      return e.type === "html" && !n ? "" : e.value;
    if (t && "alt" in e && e.alt)
      return e.alt;
    if ("children" in e)
      return Jr(e.children, t, n);
  }
  return Array.isArray(e) ? Jr(e, t, n) : "";
}
function Jr(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; )
    r[i] = is(e[i], t, n);
  return r.join("");
}
function hl(e) {
  return !!(e && typeof e == "object");
}
const Yr = document.createElement("i");
function Qn(e) {
  const t = "&" + e + ";";
  Yr.innerHTML = t;
  const n = Yr.textContent;
  return n.charCodeAt(n.length - 1) === 59 && e !== "semi" || n === t ? !1 : n;
}
function me(e, t, n, r) {
  const i = e.length;
  let s = 0, o;
  if (t < 0 ? t = -t > i ? 0 : i + t : t = t > i ? i : t, n = n > 0 ? n : 0, r.length < 1e4)
    o = Array.from(r), o.unshift(t, n), e.splice(...o);
  else
    for (n && e.splice(t, n); s < r.length; )
      o = r.slice(s, s + 1e4), o.unshift(t, 0), e.splice(...o), s += 1e4, t += 1e4;
}
function ye(e, t) {
  return e.length > 0 ? (me(e, e.length, 0, t), e) : t;
}
const Qr = {}.hasOwnProperty;
function ss(e) {
  const t = {};
  let n = -1;
  for (; ++n < e.length; )
    pl(t, e[n]);
  return t;
}
function pl(e, t) {
  let n;
  for (n in t) {
    const i = (Qr.call(e, n) ? e[n] : void 0) || (e[n] = {}), s = t[n];
    let o;
    if (s)
      for (o in s) {
        Qr.call(i, o) || (i[o] = []);
        const a = s[o];
        dl(
          // @ts-expect-error Looks like a list.
          i[o],
          Array.isArray(a) ? a : a ? [a] : []
        );
      }
  }
}
function dl(e, t) {
  let n = -1;
  const r = [];
  for (; ++n < t.length; )
    (t[n].add === "after" ? e : r).push(t[n]);
  me(e, 0, 0, r);
}
function os(e, t) {
  const n = Number.parseInt(e, t);
  return (
    // C0 except for HT, LF, FF, CR, space.
    n < 9 || n === 11 || n > 13 && n < 32 || // Control character (DEL) of C0, and C1 controls.
    n > 126 && n < 160 || // Lone high surrogates and low surrogates.
    n > 55295 && n < 57344 || // Noncharacters.
    n > 64975 && n < 65008 || /* eslint-disable no-bitwise */
    (n & 65535) === 65535 || (n & 65535) === 65534 || /* eslint-enable no-bitwise */
    // Out of range
    n > 1114111 ? "�" : String.fromCodePoint(n)
  );
}
function we(e) {
  return e.replace(/[\t\n\r ]+/g, " ").replace(/^ | $/g, "").toLowerCase().toUpperCase();
}
const oe = Fe(/[A-Za-z]/), ie = Fe(/[\dA-Za-z]/), gl = Fe(/[#-'*+\--9=?A-Z^-~]/);
function Ht(e) {
  return (
    // Special whitespace codes (which have negative values), C0 and Control
    // character DEL
    e !== null && (e < 32 || e === 127)
  );
}
const _n = Fe(/\d/), ml = Fe(/[\dA-Fa-f]/), yl = Fe(/[!-/:-@[-`{-~]/);
function F(e) {
  return e !== null && e < -2;
}
function Y(e) {
  return e !== null && (e < 0 || e === 32);
}
function H(e) {
  return e === -2 || e === -1 || e === 32;
}
const Gt = Fe(/\p{P}|\p{S}/u), We = Fe(/\s/);
function Fe(e) {
  return t;
  function t(n) {
    return n !== null && n > -1 && e.test(String.fromCharCode(n));
  }
}
function ot(e) {
  const t = [];
  let n = -1, r = 0, i = 0;
  for (; ++n < e.length; ) {
    const s = e.charCodeAt(n);
    let o = "";
    if (s === 37 && ie(e.charCodeAt(n + 1)) && ie(e.charCodeAt(n + 2)))
      i = 2;
    else if (s < 128)
      /[!#$&-;=?-Z_a-z~]/.test(String.fromCharCode(s)) || (o = String.fromCharCode(s));
    else if (s > 55295 && s < 57344) {
      const a = e.charCodeAt(n + 1);
      s < 56320 && a > 56319 && a < 57344 ? (o = String.fromCharCode(s, a), i = 1) : o = "�";
    } else
      o = String.fromCharCode(s);
    o && (t.push(e.slice(r, n), encodeURIComponent(o)), r = n + i + 1, o = ""), i && (n += i, i = 0);
  }
  return t.join("") + e.slice(r);
}
function K(e, t, n, r) {
  const i = r ? r - 1 : Number.POSITIVE_INFINITY;
  let s = 0;
  return o;
  function o(u) {
    return H(u) ? (e.enter(n), a(u)) : t(u);
  }
  function a(u) {
    return H(u) && s++ < i ? (e.consume(u), a) : (e.exit(n), t(u));
  }
}
const bl = {
  tokenize: xl
};
function xl(e) {
  const t = e.attempt(this.parser.constructs.contentInitial, r, i);
  let n;
  return t;
  function r(a) {
    if (a === null) {
      e.consume(a);
      return;
    }
    return e.enter("lineEnding"), e.consume(a), e.exit("lineEnding"), K(e, t, "linePrefix");
  }
  function i(a) {
    return e.enter("paragraph"), s(a);
  }
  function s(a) {
    const u = e.enter("chunkText", {
      contentType: "text",
      previous: n
    });
    return n && (n.next = u), n = u, o(a);
  }
  function o(a) {
    if (a === null) {
      e.exit("chunkText"), e.exit("paragraph"), e.consume(a);
      return;
    }
    return F(a) ? (e.consume(a), e.exit("chunkText"), s) : (e.consume(a), o);
  }
}
const kl = {
  tokenize: wl
}, Xr = {
  tokenize: Sl
};
function wl(e) {
  const t = this, n = [];
  let r = 0, i, s, o;
  return a;
  function a(w) {
    if (r < n.length) {
      const I = n[r];
      return t.containerState = I[1], e.attempt(I[0].continuation, u, l)(w);
    }
    return l(w);
  }
  function u(w) {
    if (r++, t.containerState._closeFlow) {
      t.containerState._closeFlow = void 0, i && v();
      const I = t.events.length;
      let O = I, S;
      for (; O--; )
        if (t.events[O][0] === "exit" && t.events[O][1].type === "chunkFlow") {
          S = t.events[O][1].end;
          break;
        }
      b(r);
      let z = I;
      for (; z < t.events.length; )
        t.events[z][1].end = {
          ...S
        }, z++;
      return me(t.events, O + 1, 0, t.events.slice(I)), t.events.length = z, l(w);
    }
    return a(w);
  }
  function l(w) {
    if (r === n.length) {
      if (!i)
        return p(w);
      if (i.currentConstruct && i.currentConstruct.concrete)
        return d(w);
      t.interrupt = !!(i.currentConstruct && !i._gfmTableDynamicInterruptHack);
    }
    return t.containerState = {}, e.check(Xr, f, c)(w);
  }
  function f(w) {
    return i && v(), b(r), p(w);
  }
  function c(w) {
    return t.parser.lazy[t.now().line] = r !== n.length, o = t.now().offset, d(w);
  }
  function p(w) {
    return t.containerState = {}, e.attempt(Xr, h, d)(w);
  }
  function h(w) {
    return r++, n.push([t.currentConstruct, t.containerState]), p(w);
  }
  function d(w) {
    if (w === null) {
      i && v(), b(0), e.consume(w);
      return;
    }
    return i = i || t.parser.flow(t.now()), e.enter("chunkFlow", {
      _tokenizer: i,
      contentType: "flow",
      previous: s
    }), y(w);
  }
  function y(w) {
    if (w === null) {
      x(e.exit("chunkFlow"), !0), b(0), e.consume(w);
      return;
    }
    return F(w) ? (e.consume(w), x(e.exit("chunkFlow")), r = 0, t.interrupt = void 0, a) : (e.consume(w), y);
  }
  function x(w, I) {
    const O = t.sliceStream(w);
    if (I && O.push(null), w.previous = s, s && (s.next = w), s = w, i.defineSkip(w.start), i.write(O), t.parser.lazy[w.start.line]) {
      let S = i.events.length;
      for (; S--; )
        if (
          // The token starts before the line ending…
          i.events[S][1].start.offset < o && // …and either is not ended yet…
          (!i.events[S][1].end || // …or ends after it.
          i.events[S][1].end.offset > o)
        )
          return;
      const z = t.events.length;
      let V = z, D, k;
      for (; V--; )
        if (t.events[V][0] === "exit" && t.events[V][1].type === "chunkFlow") {
          if (D) {
            k = t.events[V][1].end;
            break;
          }
          D = !0;
        }
      for (b(r), S = z; S < t.events.length; )
        t.events[S][1].end = {
          ...k
        }, S++;
      me(t.events, V + 1, 0, t.events.slice(z)), t.events.length = S;
    }
  }
  function b(w) {
    let I = n.length;
    for (; I-- > w; ) {
      const O = n[I];
      t.containerState = O[1], O[0].exit.call(t, e);
    }
    n.length = w;
  }
  function v() {
    i.write([null]), s = void 0, i = void 0, t.containerState._closeFlow = void 0;
  }
}
function Sl(e, t, n) {
  return K(e, e.attempt(this.parser.constructs.document, t, n), "linePrefix", this.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4);
}
function nt(e) {
  if (e === null || Y(e) || We(e))
    return 1;
  if (Gt(e))
    return 2;
}
function Jt(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; ) {
    const s = e[i].resolveAll;
    s && !r.includes(s) && (t = s(t, n), r.push(s));
  }
  return t;
}
const Fn = {
  name: "attention",
  resolveAll: vl,
  tokenize: Cl
};
function vl(e, t) {
  let n = -1, r, i, s, o, a, u, l, f;
  for (; ++n < e.length; )
    if (e[n][0] === "enter" && e[n][1].type === "attentionSequence" && e[n][1]._close) {
      for (r = n; r--; )
        if (e[r][0] === "exit" && e[r][1].type === "attentionSequence" && e[r][1]._open && // If the markers are the same:
        t.sliceSerialize(e[r][1]).charCodeAt(0) === t.sliceSerialize(e[n][1]).charCodeAt(0)) {
          if ((e[r][1]._close || e[n][1]._open) && (e[n][1].end.offset - e[n][1].start.offset) % 3 && !((e[r][1].end.offset - e[r][1].start.offset + e[n][1].end.offset - e[n][1].start.offset) % 3))
            continue;
          u = e[r][1].end.offset - e[r][1].start.offset > 1 && e[n][1].end.offset - e[n][1].start.offset > 1 ? 2 : 1;
          const c = {
            ...e[r][1].end
          }, p = {
            ...e[n][1].start
          };
          Zr(c, -u), Zr(p, u), o = {
            type: u > 1 ? "strongSequence" : "emphasisSequence",
            start: c,
            end: {
              ...e[r][1].end
            }
          }, a = {
            type: u > 1 ? "strongSequence" : "emphasisSequence",
            start: {
              ...e[n][1].start
            },
            end: p
          }, s = {
            type: u > 1 ? "strongText" : "emphasisText",
            start: {
              ...e[r][1].end
            },
            end: {
              ...e[n][1].start
            }
          }, i = {
            type: u > 1 ? "strong" : "emphasis",
            start: {
              ...o.start
            },
            end: {
              ...a.end
            }
          }, e[r][1].end = {
            ...o.start
          }, e[n][1].start = {
            ...a.end
          }, l = [], e[r][1].end.offset - e[r][1].start.offset && (l = ye(l, [["enter", e[r][1], t], ["exit", e[r][1], t]])), l = ye(l, [["enter", i, t], ["enter", o, t], ["exit", o, t], ["enter", s, t]]), l = ye(l, Jt(t.parser.constructs.insideSpan.null, e.slice(r + 1, n), t)), l = ye(l, [["exit", s, t], ["enter", a, t], ["exit", a, t], ["exit", i, t]]), e[n][1].end.offset - e[n][1].start.offset ? (f = 2, l = ye(l, [["enter", e[n][1], t], ["exit", e[n][1], t]])) : f = 0, me(e, r - 1, n - r + 3, l), n = r + l.length - f - 2;
          break;
        }
    }
  for (n = -1; ++n < e.length; )
    e[n][1].type === "attentionSequence" && (e[n][1].type = "data");
  return e;
}
function Cl(e, t) {
  const n = this.parser.constructs.attentionMarkers.null, r = this.previous, i = nt(r);
  let s;
  return o;
  function o(u) {
    return s = u, e.enter("attentionSequence"), a(u);
  }
  function a(u) {
    if (u === s)
      return e.consume(u), a;
    const l = e.exit("attentionSequence"), f = nt(u), c = !f || f === 2 && i || n.includes(u), p = !i || i === 2 && f || n.includes(r);
    return l._open = !!(s === 42 ? c : c && (i || !p)), l._close = !!(s === 42 ? p : p && (f || !c)), t(u);
  }
}
function Zr(e, t) {
  e.column += t, e.offset += t, e._bufferIndex += t;
}
const El = {
  name: "autolink",
  tokenize: Il
};
function Il(e, t, n) {
  let r = 0;
  return i;
  function i(h) {
    return e.enter("autolink"), e.enter("autolinkMarker"), e.consume(h), e.exit("autolinkMarker"), e.enter("autolinkProtocol"), s;
  }
  function s(h) {
    return oe(h) ? (e.consume(h), o) : h === 64 ? n(h) : l(h);
  }
  function o(h) {
    return h === 43 || h === 45 || h === 46 || ie(h) ? (r = 1, a(h)) : l(h);
  }
  function a(h) {
    return h === 58 ? (e.consume(h), r = 0, u) : (h === 43 || h === 45 || h === 46 || ie(h)) && r++ < 32 ? (e.consume(h), a) : (r = 0, l(h));
  }
  function u(h) {
    return h === 62 ? (e.exit("autolinkProtocol"), e.enter("autolinkMarker"), e.consume(h), e.exit("autolinkMarker"), e.exit("autolink"), t) : h === null || h === 32 || h === 60 || Ht(h) ? n(h) : (e.consume(h), u);
  }
  function l(h) {
    return h === 64 ? (e.consume(h), f) : gl(h) ? (e.consume(h), l) : n(h);
  }
  function f(h) {
    return ie(h) ? c(h) : n(h);
  }
  function c(h) {
    return h === 46 ? (e.consume(h), r = 0, f) : h === 62 ? (e.exit("autolinkProtocol").type = "autolinkEmail", e.enter("autolinkMarker"), e.consume(h), e.exit("autolinkMarker"), e.exit("autolink"), t) : p(h);
  }
  function p(h) {
    if ((h === 45 || ie(h)) && r++ < 63) {
      const d = h === 45 ? p : c;
      return e.consume(h), d;
    }
    return n(h);
  }
}
const Tt = {
  partial: !0,
  tokenize: Tl
};
function Tl(e, t, n) {
  return r;
  function r(s) {
    return H(s) ? K(e, i, "linePrefix")(s) : i(s);
  }
  function i(s) {
    return s === null || F(s) ? t(s) : n(s);
  }
}
const as = {
  continuation: {
    tokenize: Nl
  },
  exit: Al,
  name: "blockQuote",
  tokenize: Ll
};
function Ll(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    if (o === 62) {
      const a = r.containerState;
      return a.open || (e.enter("blockQuote", {
        _container: !0
      }), a.open = !0), e.enter("blockQuotePrefix"), e.enter("blockQuoteMarker"), e.consume(o), e.exit("blockQuoteMarker"), s;
    }
    return n(o);
  }
  function s(o) {
    return H(o) ? (e.enter("blockQuotePrefixWhitespace"), e.consume(o), e.exit("blockQuotePrefixWhitespace"), e.exit("blockQuotePrefix"), t) : (e.exit("blockQuotePrefix"), t(o));
  }
}
function Nl(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return H(o) ? K(e, s, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(o) : s(o);
  }
  function s(o) {
    return e.attempt(as, t, n)(o);
  }
}
function Al(e) {
  e.exit("blockQuote");
}
const ls = {
  name: "characterEscape",
  tokenize: Rl
};
function Rl(e, t, n) {
  return r;
  function r(s) {
    return e.enter("characterEscape"), e.enter("escapeMarker"), e.consume(s), e.exit("escapeMarker"), i;
  }
  function i(s) {
    return yl(s) ? (e.enter("characterEscapeValue"), e.consume(s), e.exit("characterEscapeValue"), e.exit("characterEscape"), t) : n(s);
  }
}
const us = {
  name: "characterReference",
  tokenize: Ol
};
function Ol(e, t, n) {
  const r = this;
  let i = 0, s, o;
  return a;
  function a(c) {
    return e.enter("characterReference"), e.enter("characterReferenceMarker"), e.consume(c), e.exit("characterReferenceMarker"), u;
  }
  function u(c) {
    return c === 35 ? (e.enter("characterReferenceMarkerNumeric"), e.consume(c), e.exit("characterReferenceMarkerNumeric"), l) : (e.enter("characterReferenceValue"), s = 31, o = ie, f(c));
  }
  function l(c) {
    return c === 88 || c === 120 ? (e.enter("characterReferenceMarkerHexadecimal"), e.consume(c), e.exit("characterReferenceMarkerHexadecimal"), e.enter("characterReferenceValue"), s = 6, o = ml, f) : (e.enter("characterReferenceValue"), s = 7, o = _n, f(c));
  }
  function f(c) {
    if (c === 59 && i) {
      const p = e.exit("characterReferenceValue");
      return o === ie && !Qn(r.sliceSerialize(p)) ? n(c) : (e.enter("characterReferenceMarker"), e.consume(c), e.exit("characterReferenceMarker"), e.exit("characterReference"), t);
    }
    return o(c) && i++ < s ? (e.consume(c), f) : n(c);
  }
}
const ei = {
  partial: !0,
  tokenize: Dl
}, ti = {
  concrete: !0,
  name: "codeFenced",
  tokenize: Pl
};
function Pl(e, t, n) {
  const r = this, i = {
    partial: !0,
    tokenize: O
  };
  let s = 0, o = 0, a;
  return u;
  function u(S) {
    return l(S);
  }
  function l(S) {
    const z = r.events[r.events.length - 1];
    return s = z && z[1].type === "linePrefix" ? z[2].sliceSerialize(z[1], !0).length : 0, a = S, e.enter("codeFenced"), e.enter("codeFencedFence"), e.enter("codeFencedFenceSequence"), f(S);
  }
  function f(S) {
    return S === a ? (o++, e.consume(S), f) : o < 3 ? n(S) : (e.exit("codeFencedFenceSequence"), H(S) ? K(e, c, "whitespace")(S) : c(S));
  }
  function c(S) {
    return S === null || F(S) ? (e.exit("codeFencedFence"), r.interrupt ? t(S) : e.check(ei, y, I)(S)) : (e.enter("codeFencedFenceInfo"), e.enter("chunkString", {
      contentType: "string"
    }), p(S));
  }
  function p(S) {
    return S === null || F(S) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), c(S)) : H(S) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), K(e, h, "whitespace")(S)) : S === 96 && S === a ? n(S) : (e.consume(S), p);
  }
  function h(S) {
    return S === null || F(S) ? c(S) : (e.enter("codeFencedFenceMeta"), e.enter("chunkString", {
      contentType: "string"
    }), d(S));
  }
  function d(S) {
    return S === null || F(S) ? (e.exit("chunkString"), e.exit("codeFencedFenceMeta"), c(S)) : S === 96 && S === a ? n(S) : (e.consume(S), d);
  }
  function y(S) {
    return e.attempt(i, I, x)(S);
  }
  function x(S) {
    return e.enter("lineEnding"), e.consume(S), e.exit("lineEnding"), b;
  }
  function b(S) {
    return s > 0 && H(S) ? K(e, v, "linePrefix", s + 1)(S) : v(S);
  }
  function v(S) {
    return S === null || F(S) ? e.check(ei, y, I)(S) : (e.enter("codeFlowValue"), w(S));
  }
  function w(S) {
    return S === null || F(S) ? (e.exit("codeFlowValue"), v(S)) : (e.consume(S), w);
  }
  function I(S) {
    return e.exit("codeFenced"), t(S);
  }
  function O(S, z, V) {
    let D = 0;
    return k;
    function k(A) {
      return S.enter("lineEnding"), S.consume(A), S.exit("lineEnding"), L;
    }
    function L(A) {
      return S.enter("codeFencedFence"), H(A) ? K(S, R, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(A) : R(A);
    }
    function R(A) {
      return A === a ? (S.enter("codeFencedFenceSequence"), _(A)) : V(A);
    }
    function _(A) {
      return A === a ? (D++, S.consume(A), _) : D >= o ? (S.exit("codeFencedFenceSequence"), H(A) ? K(S, P, "whitespace")(A) : P(A)) : V(A);
    }
    function P(A) {
      return A === null || F(A) ? (S.exit("codeFencedFence"), z(A)) : V(A);
    }
  }
}
function Dl(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return o === null ? n(o) : (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), s);
  }
  function s(o) {
    return r.parser.lazy[r.now().line] ? n(o) : t(o);
  }
}
const fn = {
  name: "codeIndented",
  tokenize: Fl
}, _l = {
  partial: !0,
  tokenize: zl
};
function Fl(e, t, n) {
  const r = this;
  return i;
  function i(l) {
    return e.enter("codeIndented"), K(e, s, "linePrefix", 5)(l);
  }
  function s(l) {
    const f = r.events[r.events.length - 1];
    return f && f[1].type === "linePrefix" && f[2].sliceSerialize(f[1], !0).length >= 4 ? o(l) : n(l);
  }
  function o(l) {
    return l === null ? u(l) : F(l) ? e.attempt(_l, o, u)(l) : (e.enter("codeFlowValue"), a(l));
  }
  function a(l) {
    return l === null || F(l) ? (e.exit("codeFlowValue"), o(l)) : (e.consume(l), a);
  }
  function u(l) {
    return e.exit("codeIndented"), t(l);
  }
}
function zl(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return r.parser.lazy[r.now().line] ? n(o) : F(o) ? (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), i) : K(e, s, "linePrefix", 5)(o);
  }
  function s(o) {
    const a = r.events[r.events.length - 1];
    return a && a[1].type === "linePrefix" && a[2].sliceSerialize(a[1], !0).length >= 4 ? t(o) : F(o) ? i(o) : n(o);
  }
}
const Ml = {
  name: "codeText",
  previous: $l,
  resolve: jl,
  tokenize: Bl
};
function jl(e) {
  let t = e.length - 4, n = 3, r, i;
  if ((e[n][1].type === "lineEnding" || e[n][1].type === "space") && (e[t][1].type === "lineEnding" || e[t][1].type === "space")) {
    for (r = n; ++r < t; )
      if (e[r][1].type === "codeTextData") {
        e[n][1].type = "codeTextPadding", e[t][1].type = "codeTextPadding", n += 2, t -= 2;
        break;
      }
  }
  for (r = n - 1, t++; ++r <= t; )
    i === void 0 ? r !== t && e[r][1].type !== "lineEnding" && (i = r) : (r === t || e[r][1].type === "lineEnding") && (e[i][1].type = "codeTextData", r !== i + 2 && (e[i][1].end = e[r - 1][1].end, e.splice(i + 2, r - i - 2), t -= r - i - 2, r = i + 2), i = void 0);
  return e;
}
function $l(e) {
  return e !== 96 || this.events[this.events.length - 1][1].type === "characterEscape";
}
function Bl(e, t, n) {
  let r = 0, i, s;
  return o;
  function o(c) {
    return e.enter("codeText"), e.enter("codeTextSequence"), a(c);
  }
  function a(c) {
    return c === 96 ? (e.consume(c), r++, a) : (e.exit("codeTextSequence"), u(c));
  }
  function u(c) {
    return c === null ? n(c) : c === 32 ? (e.enter("space"), e.consume(c), e.exit("space"), u) : c === 96 ? (s = e.enter("codeTextSequence"), i = 0, f(c)) : F(c) ? (e.enter("lineEnding"), e.consume(c), e.exit("lineEnding"), u) : (e.enter("codeTextData"), l(c));
  }
  function l(c) {
    return c === null || c === 32 || c === 96 || F(c) ? (e.exit("codeTextData"), u(c)) : (e.consume(c), l);
  }
  function f(c) {
    return c === 96 ? (e.consume(c), i++, f) : i === r ? (e.exit("codeTextSequence"), e.exit("codeText"), t(c)) : (s.type = "codeTextData", l(c));
  }
}
class Ul {
  /**
   * @param {ReadonlyArray<T> | null | undefined} [initial]
   *   Initial items (optional).
   * @returns
   *   Splice buffer.
   */
  constructor(t) {
    this.left = t ? [...t] : [], this.right = [];
  }
  /**
   * Array access;
   * does not move the cursor.
   *
   * @param {number} index
   *   Index.
   * @return {T}
   *   Item.
   */
  get(t) {
    if (t < 0 || t >= this.left.length + this.right.length)
      throw new RangeError("Cannot access index `" + t + "` in a splice buffer of size `" + (this.left.length + this.right.length) + "`");
    return t < this.left.length ? this.left[t] : this.right[this.right.length - t + this.left.length - 1];
  }
  /**
   * The length of the splice buffer, one greater than the largest index in the
   * array.
   */
  get length() {
    return this.left.length + this.right.length;
  }
  /**
   * Remove and return `list[0]`;
   * moves the cursor to `0`.
   *
   * @returns {T | undefined}
   *   Item, optional.
   */
  shift() {
    return this.setCursor(0), this.right.pop();
  }
  /**
   * Slice the buffer to get an array;
   * does not move the cursor.
   *
   * @param {number} start
   *   Start.
   * @param {number | null | undefined} [end]
   *   End (optional).
   * @returns {Array<T>}
   *   Array of items.
   */
  slice(t, n) {
    const r = n ?? Number.POSITIVE_INFINITY;
    return r < this.left.length ? this.left.slice(t, r) : t > this.left.length ? this.right.slice(this.right.length - r + this.left.length, this.right.length - t + this.left.length).reverse() : this.left.slice(t).concat(this.right.slice(this.right.length - r + this.left.length).reverse());
  }
  /**
   * Mimics the behavior of Array.prototype.splice() except for the change of
   * interface necessary to avoid segfaults when patching in very large arrays.
   *
   * This operation moves cursor is moved to `start` and results in the cursor
   * placed after any inserted items.
   *
   * @param {number} start
   *   Start;
   *   zero-based index at which to start changing the array;
   *   negative numbers count backwards from the end of the array and values
   *   that are out-of bounds are clamped to the appropriate end of the array.
   * @param {number | null | undefined} [deleteCount=0]
   *   Delete count (default: `0`);
   *   maximum number of elements to delete, starting from start.
   * @param {Array<T> | null | undefined} [items=[]]
   *   Items to include in place of the deleted items (default: `[]`).
   * @return {Array<T>}
   *   Any removed items.
   */
  splice(t, n, r) {
    const i = n || 0;
    this.setCursor(Math.trunc(t));
    const s = this.right.splice(this.right.length - i, Number.POSITIVE_INFINITY);
    return r && dt(this.left, r), s.reverse();
  }
  /**
   * Remove and return the highest-numbered item in the array, so
   * `list[list.length - 1]`;
   * Moves the cursor to `length`.
   *
   * @returns {T | undefined}
   *   Item, optional.
   */
  pop() {
    return this.setCursor(Number.POSITIVE_INFINITY), this.left.pop();
  }
  /**
   * Inserts a single item to the high-numbered side of the array;
   * moves the cursor to `length`.
   *
   * @param {T} item
   *   Item.
   * @returns {undefined}
   *   Nothing.
   */
  push(t) {
    this.setCursor(Number.POSITIVE_INFINITY), this.left.push(t);
  }
  /**
   * Inserts many items to the high-numbered side of the array.
   * Moves the cursor to `length`.
   *
   * @param {Array<T>} items
   *   Items.
   * @returns {undefined}
   *   Nothing.
   */
  pushMany(t) {
    this.setCursor(Number.POSITIVE_INFINITY), dt(this.left, t);
  }
  /**
   * Inserts a single item to the low-numbered side of the array;
   * Moves the cursor to `0`.
   *
   * @param {T} item
   *   Item.
   * @returns {undefined}
   *   Nothing.
   */
  unshift(t) {
    this.setCursor(0), this.right.push(t);
  }
  /**
   * Inserts many items to the low-numbered side of the array;
   * moves the cursor to `0`.
   *
   * @param {Array<T>} items
   *   Items.
   * @returns {undefined}
   *   Nothing.
   */
  unshiftMany(t) {
    this.setCursor(0), dt(this.right, t.reverse());
  }
  /**
   * Move the cursor to a specific position in the array. Requires
   * time proportional to the distance moved.
   *
   * If `n < 0`, the cursor will end up at the beginning.
   * If `n > length`, the cursor will end up at the end.
   *
   * @param {number} n
   *   Position.
   * @return {undefined}
   *   Nothing.
   */
  setCursor(t) {
    if (!(t === this.left.length || t > this.left.length && this.right.length === 0 || t < 0 && this.left.length === 0))
      if (t < this.left.length) {
        const n = this.left.splice(t, Number.POSITIVE_INFINITY);
        dt(this.right, n.reverse());
      } else {
        const n = this.right.splice(this.left.length + this.right.length - t, Number.POSITIVE_INFINITY);
        dt(this.left, n.reverse());
      }
  }
}
function dt(e, t) {
  let n = 0;
  if (t.length < 1e4)
    e.push(...t);
  else
    for (; n < t.length; )
      e.push(...t.slice(n, n + 1e4)), n += 1e4;
}
function cs(e) {
  const t = {};
  let n = -1, r, i, s, o, a, u, l;
  const f = new Ul(e);
  for (; ++n < f.length; ) {
    for (; n in t; )
      n = t[n];
    if (r = f.get(n), n && r[1].type === "chunkFlow" && f.get(n - 1)[1].type === "listItemPrefix" && (u = r[1]._tokenizer.events, s = 0, s < u.length && u[s][1].type === "lineEndingBlank" && (s += 2), s < u.length && u[s][1].type === "content"))
      for (; ++s < u.length && u[s][1].type !== "content"; )
        u[s][1].type === "chunkText" && (u[s][1]._isInFirstContentOfListItem = !0, s++);
    if (r[0] === "enter")
      r[1].contentType && (Object.assign(t, Hl(f, n)), n = t[n], l = !0);
    else if (r[1]._container) {
      for (s = n, i = void 0; s--; )
        if (o = f.get(s), o[1].type === "lineEnding" || o[1].type === "lineEndingBlank")
          o[0] === "enter" && (i && (f.get(i)[1].type = "lineEndingBlank"), o[1].type = "lineEnding", i = s);
        else if (!(o[1].type === "linePrefix" || o[1].type === "listItemIndent")) break;
      i && (r[1].end = {
        ...f.get(i)[1].start
      }, a = f.slice(i, n), a.unshift(r), f.splice(i, n - i + 1, a));
    }
  }
  return me(e, 0, Number.POSITIVE_INFINITY, f.slice(0)), !l;
}
function Hl(e, t) {
  const n = e.get(t)[1], r = e.get(t)[2];
  let i = t - 1;
  const s = [];
  let o = n._tokenizer;
  o || (o = r.parser[n.contentType](n.start), n._contentTypeTextTrailing && (o._contentTypeTextTrailing = !0));
  const a = o.events, u = [], l = {};
  let f, c, p = -1, h = n, d = 0, y = 0;
  const x = [y];
  for (; h; ) {
    for (; e.get(++i)[1] !== h; )
      ;
    s.push(i), h._tokenizer || (f = r.sliceStream(h), h.next || f.push(null), c && o.defineSkip(h.start), h._isInFirstContentOfListItem && (o._gfmTasklistFirstContentOfListItem = !0), o.write(f), h._isInFirstContentOfListItem && (o._gfmTasklistFirstContentOfListItem = void 0)), c = h, h = h.next;
  }
  for (h = n; ++p < a.length; )
    // Find a void token that includes a break.
    a[p][0] === "exit" && a[p - 1][0] === "enter" && a[p][1].type === a[p - 1][1].type && a[p][1].start.line !== a[p][1].end.line && (y = p + 1, x.push(y), h._tokenizer = void 0, h.previous = void 0, h = h.next);
  for (o.events = [], h ? (h._tokenizer = void 0, h.previous = void 0) : x.pop(), p = x.length; p--; ) {
    const b = a.slice(x[p], x[p + 1]), v = s.pop();
    u.push([v, v + b.length - 1]), e.splice(v, 2, b);
  }
  for (u.reverse(), p = -1; ++p < u.length; )
    l[d + u[p][0]] = d + u[p][1], d += u[p][1] - u[p][0] - 1;
  return l;
}
const Vl = {
  resolve: Kl,
  tokenize: Wl
}, ql = {
  partial: !0,
  tokenize: Gl
};
function Kl(e) {
  return cs(e), e;
}
function Wl(e, t) {
  let n;
  return r;
  function r(a) {
    return e.enter("content"), n = e.enter("chunkContent", {
      contentType: "content"
    }), i(a);
  }
  function i(a) {
    return a === null ? s(a) : F(a) ? e.check(ql, o, s)(a) : (e.consume(a), i);
  }
  function s(a) {
    return e.exit("chunkContent"), e.exit("content"), t(a);
  }
  function o(a) {
    return e.consume(a), e.exit("chunkContent"), n.next = e.enter("chunkContent", {
      contentType: "content",
      previous: n
    }), n = n.next, i;
  }
}
function Gl(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return e.exit("chunkContent"), e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), K(e, s, "linePrefix");
  }
  function s(o) {
    if (o === null || F(o))
      return n(o);
    const a = r.events[r.events.length - 1];
    return !r.parser.constructs.disable.null.includes("codeIndented") && a && a[1].type === "linePrefix" && a[2].sliceSerialize(a[1], !0).length >= 4 ? t(o) : e.interrupt(r.parser.constructs.flow, n, t)(o);
  }
}
function fs(e, t, n, r, i, s, o, a, u) {
  const l = u || Number.POSITIVE_INFINITY;
  let f = 0;
  return c;
  function c(b) {
    return b === 60 ? (e.enter(r), e.enter(i), e.enter(s), e.consume(b), e.exit(s), p) : b === null || b === 32 || b === 41 || Ht(b) ? n(b) : (e.enter(r), e.enter(o), e.enter(a), e.enter("chunkString", {
      contentType: "string"
    }), y(b));
  }
  function p(b) {
    return b === 62 ? (e.enter(s), e.consume(b), e.exit(s), e.exit(i), e.exit(r), t) : (e.enter(a), e.enter("chunkString", {
      contentType: "string"
    }), h(b));
  }
  function h(b) {
    return b === 62 ? (e.exit("chunkString"), e.exit(a), p(b)) : b === null || b === 60 || F(b) ? n(b) : (e.consume(b), b === 92 ? d : h);
  }
  function d(b) {
    return b === 60 || b === 62 || b === 92 ? (e.consume(b), h) : h(b);
  }
  function y(b) {
    return !f && (b === null || b === 41 || Y(b)) ? (e.exit("chunkString"), e.exit(a), e.exit(o), e.exit(r), t(b)) : f < l && b === 40 ? (e.consume(b), f++, y) : b === 41 ? (e.consume(b), f--, y) : b === null || b === 32 || b === 40 || Ht(b) ? n(b) : (e.consume(b), b === 92 ? x : y);
  }
  function x(b) {
    return b === 40 || b === 41 || b === 92 ? (e.consume(b), y) : y(b);
  }
}
function hs(e, t, n, r, i, s) {
  const o = this;
  let a = 0, u;
  return l;
  function l(h) {
    return e.enter(r), e.enter(i), e.consume(h), e.exit(i), e.enter(s), f;
  }
  function f(h) {
    return a > 999 || h === null || h === 91 || h === 93 && !u || // To do: remove in the future once we’ve switched from
    // `micromark-extension-footnote` to `micromark-extension-gfm-footnote`,
    // which doesn’t need this.
    // Hidden footnotes hook.
    /* c8 ignore next 3 */
    h === 94 && !a && "_hiddenFootnoteSupport" in o.parser.constructs ? n(h) : h === 93 ? (e.exit(s), e.enter(i), e.consume(h), e.exit(i), e.exit(r), t) : F(h) ? (e.enter("lineEnding"), e.consume(h), e.exit("lineEnding"), f) : (e.enter("chunkString", {
      contentType: "string"
    }), c(h));
  }
  function c(h) {
    return h === null || h === 91 || h === 93 || F(h) || a++ > 999 ? (e.exit("chunkString"), f(h)) : (e.consume(h), u || (u = !H(h)), h === 92 ? p : c);
  }
  function p(h) {
    return h === 91 || h === 92 || h === 93 ? (e.consume(h), a++, c) : c(h);
  }
}
function ps(e, t, n, r, i, s) {
  let o;
  return a;
  function a(p) {
    return p === 34 || p === 39 || p === 40 ? (e.enter(r), e.enter(i), e.consume(p), e.exit(i), o = p === 40 ? 41 : p, u) : n(p);
  }
  function u(p) {
    return p === o ? (e.enter(i), e.consume(p), e.exit(i), e.exit(r), t) : (e.enter(s), l(p));
  }
  function l(p) {
    return p === o ? (e.exit(s), u(o)) : p === null ? n(p) : F(p) ? (e.enter("lineEnding"), e.consume(p), e.exit("lineEnding"), K(e, l, "linePrefix")) : (e.enter("chunkString", {
      contentType: "string"
    }), f(p));
  }
  function f(p) {
    return p === o || p === null || F(p) ? (e.exit("chunkString"), l(p)) : (e.consume(p), p === 92 ? c : f);
  }
  function c(p) {
    return p === o || p === 92 ? (e.consume(p), f) : f(p);
  }
}
function kt(e, t) {
  let n;
  return r;
  function r(i) {
    return F(i) ? (e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), n = !0, r) : H(i) ? K(e, r, n ? "linePrefix" : "lineSuffix")(i) : t(i);
  }
}
const Jl = {
  name: "definition",
  tokenize: Ql
}, Yl = {
  partial: !0,
  tokenize: Xl
};
function Ql(e, t, n) {
  const r = this;
  let i;
  return s;
  function s(h) {
    return e.enter("definition"), o(h);
  }
  function o(h) {
    return hs.call(
      r,
      e,
      a,
      // Note: we don’t need to reset the way `markdown-rs` does.
      n,
      "definitionLabel",
      "definitionLabelMarker",
      "definitionLabelString"
    )(h);
  }
  function a(h) {
    return i = we(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1)), h === 58 ? (e.enter("definitionMarker"), e.consume(h), e.exit("definitionMarker"), u) : n(h);
  }
  function u(h) {
    return Y(h) ? kt(e, l)(h) : l(h);
  }
  function l(h) {
    return fs(
      e,
      f,
      // Note: we don’t need to reset the way `markdown-rs` does.
      n,
      "definitionDestination",
      "definitionDestinationLiteral",
      "definitionDestinationLiteralMarker",
      "definitionDestinationRaw",
      "definitionDestinationString"
    )(h);
  }
  function f(h) {
    return e.attempt(Yl, c, c)(h);
  }
  function c(h) {
    return H(h) ? K(e, p, "whitespace")(h) : p(h);
  }
  function p(h) {
    return h === null || F(h) ? (e.exit("definition"), r.parser.defined.push(i), t(h)) : n(h);
  }
}
function Xl(e, t, n) {
  return r;
  function r(a) {
    return Y(a) ? kt(e, i)(a) : n(a);
  }
  function i(a) {
    return ps(e, s, n, "definitionTitle", "definitionTitleMarker", "definitionTitleString")(a);
  }
  function s(a) {
    return H(a) ? K(e, o, "whitespace")(a) : o(a);
  }
  function o(a) {
    return a === null || F(a) ? t(a) : n(a);
  }
}
const Zl = {
  name: "hardBreakEscape",
  tokenize: eu
};
function eu(e, t, n) {
  return r;
  function r(s) {
    return e.enter("hardBreakEscape"), e.consume(s), i;
  }
  function i(s) {
    return F(s) ? (e.exit("hardBreakEscape"), t(s)) : n(s);
  }
}
const tu = {
  name: "headingAtx",
  resolve: nu,
  tokenize: ru
};
function nu(e, t) {
  let n = e.length - 2, r = 3, i, s;
  return e[r][1].type === "whitespace" && (r += 2), n - 2 > r && e[n][1].type === "whitespace" && (n -= 2), e[n][1].type === "atxHeadingSequence" && (r === n - 1 || n - 4 > r && e[n - 2][1].type === "whitespace") && (n -= r + 1 === n ? 2 : 4), n > r && (i = {
    type: "atxHeadingText",
    start: e[r][1].start,
    end: e[n][1].end
  }, s = {
    type: "chunkText",
    start: e[r][1].start,
    end: e[n][1].end,
    contentType: "text"
  }, me(e, r, n - r + 1, [["enter", i, t], ["enter", s, t], ["exit", s, t], ["exit", i, t]])), e;
}
function ru(e, t, n) {
  let r = 0;
  return i;
  function i(f) {
    return e.enter("atxHeading"), s(f);
  }
  function s(f) {
    return e.enter("atxHeadingSequence"), o(f);
  }
  function o(f) {
    return f === 35 && r++ < 6 ? (e.consume(f), o) : f === null || Y(f) ? (e.exit("atxHeadingSequence"), a(f)) : n(f);
  }
  function a(f) {
    return f === 35 ? (e.enter("atxHeadingSequence"), u(f)) : f === null || F(f) ? (e.exit("atxHeading"), t(f)) : H(f) ? K(e, a, "whitespace")(f) : (e.enter("atxHeadingText"), l(f));
  }
  function u(f) {
    return f === 35 ? (e.consume(f), u) : (e.exit("atxHeadingSequence"), a(f));
  }
  function l(f) {
    return f === null || f === 35 || Y(f) ? (e.exit("atxHeadingText"), a(f)) : (e.consume(f), l);
  }
}
const iu = [
  "address",
  "article",
  "aside",
  "base",
  "basefont",
  "blockquote",
  "body",
  "caption",
  "center",
  "col",
  "colgroup",
  "dd",
  "details",
  "dialog",
  "dir",
  "div",
  "dl",
  "dt",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "frame",
  "frameset",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "iframe",
  "legend",
  "li",
  "link",
  "main",
  "menu",
  "menuitem",
  "nav",
  "noframes",
  "ol",
  "optgroup",
  "option",
  "p",
  "param",
  "search",
  "section",
  "summary",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "title",
  "tr",
  "track",
  "ul"
], ni = ["pre", "script", "style", "textarea"], su = {
  concrete: !0,
  name: "htmlFlow",
  resolveTo: lu,
  tokenize: uu
}, ou = {
  partial: !0,
  tokenize: fu
}, au = {
  partial: !0,
  tokenize: cu
};
function lu(e) {
  let t = e.length;
  for (; t-- && !(e[t][0] === "enter" && e[t][1].type === "htmlFlow"); )
    ;
  return t > 1 && e[t - 2][1].type === "linePrefix" && (e[t][1].start = e[t - 2][1].start, e[t + 1][1].start = e[t - 2][1].start, e.splice(t - 2, 2)), e;
}
function uu(e, t, n) {
  const r = this;
  let i, s, o, a, u;
  return l;
  function l(m) {
    return f(m);
  }
  function f(m) {
    return e.enter("htmlFlow"), e.enter("htmlFlowData"), e.consume(m), c;
  }
  function c(m) {
    return m === 33 ? (e.consume(m), p) : m === 47 ? (e.consume(m), s = !0, y) : m === 63 ? (e.consume(m), i = 3, r.interrupt ? t : g) : oe(m) ? (e.consume(m), o = String.fromCharCode(m), x) : n(m);
  }
  function p(m) {
    return m === 45 ? (e.consume(m), i = 2, h) : m === 91 ? (e.consume(m), i = 5, a = 0, d) : oe(m) ? (e.consume(m), i = 4, r.interrupt ? t : g) : n(m);
  }
  function h(m) {
    return m === 45 ? (e.consume(m), r.interrupt ? t : g) : n(m);
  }
  function d(m) {
    const ce = "CDATA[";
    return m === ce.charCodeAt(a++) ? (e.consume(m), a === ce.length ? r.interrupt ? t : R : d) : n(m);
  }
  function y(m) {
    return oe(m) ? (e.consume(m), o = String.fromCharCode(m), x) : n(m);
  }
  function x(m) {
    if (m === null || m === 47 || m === 62 || Y(m)) {
      const ce = m === 47, ze = o.toLowerCase();
      return !ce && !s && ni.includes(ze) ? (i = 1, r.interrupt ? t(m) : R(m)) : iu.includes(o.toLowerCase()) ? (i = 6, ce ? (e.consume(m), b) : r.interrupt ? t(m) : R(m)) : (i = 7, r.interrupt && !r.parser.lazy[r.now().line] ? n(m) : s ? v(m) : w(m));
    }
    return m === 45 || ie(m) ? (e.consume(m), o += String.fromCharCode(m), x) : n(m);
  }
  function b(m) {
    return m === 62 ? (e.consume(m), r.interrupt ? t : R) : n(m);
  }
  function v(m) {
    return H(m) ? (e.consume(m), v) : k(m);
  }
  function w(m) {
    return m === 47 ? (e.consume(m), k) : m === 58 || m === 95 || oe(m) ? (e.consume(m), I) : H(m) ? (e.consume(m), w) : k(m);
  }
  function I(m) {
    return m === 45 || m === 46 || m === 58 || m === 95 || ie(m) ? (e.consume(m), I) : O(m);
  }
  function O(m) {
    return m === 61 ? (e.consume(m), S) : H(m) ? (e.consume(m), O) : w(m);
  }
  function S(m) {
    return m === null || m === 60 || m === 61 || m === 62 || m === 96 ? n(m) : m === 34 || m === 39 ? (e.consume(m), u = m, z) : H(m) ? (e.consume(m), S) : V(m);
  }
  function z(m) {
    return m === u ? (e.consume(m), u = null, D) : m === null || F(m) ? n(m) : (e.consume(m), z);
  }
  function V(m) {
    return m === null || m === 34 || m === 39 || m === 47 || m === 60 || m === 61 || m === 62 || m === 96 || Y(m) ? O(m) : (e.consume(m), V);
  }
  function D(m) {
    return m === 47 || m === 62 || H(m) ? w(m) : n(m);
  }
  function k(m) {
    return m === 62 ? (e.consume(m), L) : n(m);
  }
  function L(m) {
    return m === null || F(m) ? R(m) : H(m) ? (e.consume(m), L) : n(m);
  }
  function R(m) {
    return m === 45 && i === 2 ? (e.consume(m), U) : m === 60 && i === 1 ? (e.consume(m), W) : m === 62 && i === 4 ? (e.consume(m), Q) : m === 63 && i === 3 ? (e.consume(m), g) : m === 93 && i === 5 ? (e.consume(m), ue) : F(m) && (i === 6 || i === 7) ? (e.exit("htmlFlowData"), e.check(ou, ne, _)(m)) : m === null || F(m) ? (e.exit("htmlFlowData"), _(m)) : (e.consume(m), R);
  }
  function _(m) {
    return e.check(au, P, ne)(m);
  }
  function P(m) {
    return e.enter("lineEnding"), e.consume(m), e.exit("lineEnding"), A;
  }
  function A(m) {
    return m === null || F(m) ? _(m) : (e.enter("htmlFlowData"), R(m));
  }
  function U(m) {
    return m === 45 ? (e.consume(m), g) : R(m);
  }
  function W(m) {
    return m === 47 ? (e.consume(m), o = "", te) : R(m);
  }
  function te(m) {
    if (m === 62) {
      const ce = o.toLowerCase();
      return ni.includes(ce) ? (e.consume(m), Q) : R(m);
    }
    return oe(m) && o.length < 8 ? (e.consume(m), o += String.fromCharCode(m), te) : R(m);
  }
  function ue(m) {
    return m === 93 ? (e.consume(m), g) : R(m);
  }
  function g(m) {
    return m === 62 ? (e.consume(m), Q) : m === 45 && i === 2 ? (e.consume(m), g) : R(m);
  }
  function Q(m) {
    return m === null || F(m) ? (e.exit("htmlFlowData"), ne(m)) : (e.consume(m), Q);
  }
  function ne(m) {
    return e.exit("htmlFlow"), t(m);
  }
}
function cu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return F(o) ? (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), s) : n(o);
  }
  function s(o) {
    return r.parser.lazy[r.now().line] ? n(o) : t(o);
  }
}
function fu(e, t, n) {
  return r;
  function r(i) {
    return e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), e.attempt(Tt, t, n);
  }
}
const hu = {
  name: "htmlText",
  tokenize: pu
};
function pu(e, t, n) {
  const r = this;
  let i, s, o;
  return a;
  function a(g) {
    return e.enter("htmlText"), e.enter("htmlTextData"), e.consume(g), u;
  }
  function u(g) {
    return g === 33 ? (e.consume(g), l) : g === 47 ? (e.consume(g), O) : g === 63 ? (e.consume(g), w) : oe(g) ? (e.consume(g), V) : n(g);
  }
  function l(g) {
    return g === 45 ? (e.consume(g), f) : g === 91 ? (e.consume(g), s = 0, d) : oe(g) ? (e.consume(g), v) : n(g);
  }
  function f(g) {
    return g === 45 ? (e.consume(g), h) : n(g);
  }
  function c(g) {
    return g === null ? n(g) : g === 45 ? (e.consume(g), p) : F(g) ? (o = c, W(g)) : (e.consume(g), c);
  }
  function p(g) {
    return g === 45 ? (e.consume(g), h) : c(g);
  }
  function h(g) {
    return g === 62 ? U(g) : g === 45 ? p(g) : c(g);
  }
  function d(g) {
    const Q = "CDATA[";
    return g === Q.charCodeAt(s++) ? (e.consume(g), s === Q.length ? y : d) : n(g);
  }
  function y(g) {
    return g === null ? n(g) : g === 93 ? (e.consume(g), x) : F(g) ? (o = y, W(g)) : (e.consume(g), y);
  }
  function x(g) {
    return g === 93 ? (e.consume(g), b) : y(g);
  }
  function b(g) {
    return g === 62 ? U(g) : g === 93 ? (e.consume(g), b) : y(g);
  }
  function v(g) {
    return g === null || g === 62 ? U(g) : F(g) ? (o = v, W(g)) : (e.consume(g), v);
  }
  function w(g) {
    return g === null ? n(g) : g === 63 ? (e.consume(g), I) : F(g) ? (o = w, W(g)) : (e.consume(g), w);
  }
  function I(g) {
    return g === 62 ? U(g) : w(g);
  }
  function O(g) {
    return oe(g) ? (e.consume(g), S) : n(g);
  }
  function S(g) {
    return g === 45 || ie(g) ? (e.consume(g), S) : z(g);
  }
  function z(g) {
    return F(g) ? (o = z, W(g)) : H(g) ? (e.consume(g), z) : U(g);
  }
  function V(g) {
    return g === 45 || ie(g) ? (e.consume(g), V) : g === 47 || g === 62 || Y(g) ? D(g) : n(g);
  }
  function D(g) {
    return g === 47 ? (e.consume(g), U) : g === 58 || g === 95 || oe(g) ? (e.consume(g), k) : F(g) ? (o = D, W(g)) : H(g) ? (e.consume(g), D) : U(g);
  }
  function k(g) {
    return g === 45 || g === 46 || g === 58 || g === 95 || ie(g) ? (e.consume(g), k) : L(g);
  }
  function L(g) {
    return g === 61 ? (e.consume(g), R) : F(g) ? (o = L, W(g)) : H(g) ? (e.consume(g), L) : D(g);
  }
  function R(g) {
    return g === null || g === 60 || g === 61 || g === 62 || g === 96 ? n(g) : g === 34 || g === 39 ? (e.consume(g), i = g, _) : F(g) ? (o = R, W(g)) : H(g) ? (e.consume(g), R) : (e.consume(g), P);
  }
  function _(g) {
    return g === i ? (e.consume(g), i = void 0, A) : g === null ? n(g) : F(g) ? (o = _, W(g)) : (e.consume(g), _);
  }
  function P(g) {
    return g === null || g === 34 || g === 39 || g === 60 || g === 61 || g === 96 ? n(g) : g === 47 || g === 62 || Y(g) ? D(g) : (e.consume(g), P);
  }
  function A(g) {
    return g === 47 || g === 62 || Y(g) ? D(g) : n(g);
  }
  function U(g) {
    return g === 62 ? (e.consume(g), e.exit("htmlTextData"), e.exit("htmlText"), t) : n(g);
  }
  function W(g) {
    return e.exit("htmlTextData"), e.enter("lineEnding"), e.consume(g), e.exit("lineEnding"), te;
  }
  function te(g) {
    return H(g) ? K(e, ue, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(g) : ue(g);
  }
  function ue(g) {
    return e.enter("htmlTextData"), o(g);
  }
}
const Xn = {
  name: "labelEnd",
  resolveAll: yu,
  resolveTo: bu,
  tokenize: xu
}, du = {
  tokenize: ku
}, gu = {
  tokenize: wu
}, mu = {
  tokenize: Su
};
function yu(e) {
  let t = -1;
  const n = [];
  for (; ++t < e.length; ) {
    const r = e[t][1];
    if (n.push(e[t]), r.type === "labelImage" || r.type === "labelLink" || r.type === "labelEnd") {
      const i = r.type === "labelImage" ? 4 : 2;
      r.type = "data", t += i;
    }
  }
  return e.length !== n.length && me(e, 0, e.length, n), e;
}
function bu(e, t) {
  let n = e.length, r = 0, i, s, o, a;
  for (; n--; )
    if (i = e[n][1], s) {
      if (i.type === "link" || i.type === "labelLink" && i._inactive)
        break;
      e[n][0] === "enter" && i.type === "labelLink" && (i._inactive = !0);
    } else if (o) {
      if (e[n][0] === "enter" && (i.type === "labelImage" || i.type === "labelLink") && !i._balanced && (s = n, i.type !== "labelLink")) {
        r = 2;
        break;
      }
    } else i.type === "labelEnd" && (o = n);
  const u = {
    type: e[s][1].type === "labelLink" ? "link" : "image",
    start: {
      ...e[s][1].start
    },
    end: {
      ...e[e.length - 1][1].end
    }
  }, l = {
    type: "label",
    start: {
      ...e[s][1].start
    },
    end: {
      ...e[o][1].end
    }
  }, f = {
    type: "labelText",
    start: {
      ...e[s + r + 2][1].end
    },
    end: {
      ...e[o - 2][1].start
    }
  };
  return a = [["enter", u, t], ["enter", l, t]], a = ye(a, e.slice(s + 1, s + r + 3)), a = ye(a, [["enter", f, t]]), a = ye(a, Jt(t.parser.constructs.insideSpan.null, e.slice(s + r + 4, o - 3), t)), a = ye(a, [["exit", f, t], e[o - 2], e[o - 1], ["exit", l, t]]), a = ye(a, e.slice(o + 1)), a = ye(a, [["exit", u, t]]), me(e, s, e.length, a), e;
}
function xu(e, t, n) {
  const r = this;
  let i = r.events.length, s, o;
  for (; i--; )
    if ((r.events[i][1].type === "labelImage" || r.events[i][1].type === "labelLink") && !r.events[i][1]._balanced) {
      s = r.events[i][1];
      break;
    }
  return a;
  function a(p) {
    return s ? s._inactive ? c(p) : (o = r.parser.defined.includes(we(r.sliceSerialize({
      start: s.end,
      end: r.now()
    }))), e.enter("labelEnd"), e.enter("labelMarker"), e.consume(p), e.exit("labelMarker"), e.exit("labelEnd"), u) : n(p);
  }
  function u(p) {
    return p === 40 ? e.attempt(du, f, o ? f : c)(p) : p === 91 ? e.attempt(gu, f, o ? l : c)(p) : o ? f(p) : c(p);
  }
  function l(p) {
    return e.attempt(mu, f, c)(p);
  }
  function f(p) {
    return t(p);
  }
  function c(p) {
    return s._balanced = !0, n(p);
  }
}
function ku(e, t, n) {
  return r;
  function r(c) {
    return e.enter("resource"), e.enter("resourceMarker"), e.consume(c), e.exit("resourceMarker"), i;
  }
  function i(c) {
    return Y(c) ? kt(e, s)(c) : s(c);
  }
  function s(c) {
    return c === 41 ? f(c) : fs(e, o, a, "resourceDestination", "resourceDestinationLiteral", "resourceDestinationLiteralMarker", "resourceDestinationRaw", "resourceDestinationString", 32)(c);
  }
  function o(c) {
    return Y(c) ? kt(e, u)(c) : f(c);
  }
  function a(c) {
    return n(c);
  }
  function u(c) {
    return c === 34 || c === 39 || c === 40 ? ps(e, l, n, "resourceTitle", "resourceTitleMarker", "resourceTitleString")(c) : f(c);
  }
  function l(c) {
    return Y(c) ? kt(e, f)(c) : f(c);
  }
  function f(c) {
    return c === 41 ? (e.enter("resourceMarker"), e.consume(c), e.exit("resourceMarker"), e.exit("resource"), t) : n(c);
  }
}
function wu(e, t, n) {
  const r = this;
  return i;
  function i(a) {
    return hs.call(r, e, s, o, "reference", "referenceMarker", "referenceString")(a);
  }
  function s(a) {
    return r.parser.defined.includes(we(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1))) ? t(a) : n(a);
  }
  function o(a) {
    return n(a);
  }
}
function Su(e, t, n) {
  return r;
  function r(s) {
    return e.enter("reference"), e.enter("referenceMarker"), e.consume(s), e.exit("referenceMarker"), i;
  }
  function i(s) {
    return s === 93 ? (e.enter("referenceMarker"), e.consume(s), e.exit("referenceMarker"), e.exit("reference"), t) : n(s);
  }
}
const vu = {
  name: "labelStartImage",
  resolveAll: Xn.resolveAll,
  tokenize: Cu
};
function Cu(e, t, n) {
  const r = this;
  return i;
  function i(a) {
    return e.enter("labelImage"), e.enter("labelImageMarker"), e.consume(a), e.exit("labelImageMarker"), s;
  }
  function s(a) {
    return a === 91 ? (e.enter("labelMarker"), e.consume(a), e.exit("labelMarker"), e.exit("labelImage"), o) : n(a);
  }
  function o(a) {
    return a === 94 && "_hiddenFootnoteSupport" in r.parser.constructs ? n(a) : t(a);
  }
}
const Eu = {
  name: "labelStartLink",
  resolveAll: Xn.resolveAll,
  tokenize: Iu
};
function Iu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return e.enter("labelLink"), e.enter("labelMarker"), e.consume(o), e.exit("labelMarker"), e.exit("labelLink"), s;
  }
  function s(o) {
    return o === 94 && "_hiddenFootnoteSupport" in r.parser.constructs ? n(o) : t(o);
  }
}
const hn = {
  name: "lineEnding",
  tokenize: Tu
};
function Tu(e, t) {
  return n;
  function n(r) {
    return e.enter("lineEnding"), e.consume(r), e.exit("lineEnding"), K(e, t, "linePrefix");
  }
}
const jt = {
  name: "thematicBreak",
  tokenize: Lu
};
function Lu(e, t, n) {
  let r = 0, i;
  return s;
  function s(l) {
    return e.enter("thematicBreak"), o(l);
  }
  function o(l) {
    return i = l, a(l);
  }
  function a(l) {
    return l === i ? (e.enter("thematicBreakSequence"), u(l)) : r >= 3 && (l === null || F(l)) ? (e.exit("thematicBreak"), t(l)) : n(l);
  }
  function u(l) {
    return l === i ? (e.consume(l), r++, u) : (e.exit("thematicBreakSequence"), H(l) ? K(e, a, "whitespace")(l) : a(l));
  }
}
const fe = {
  continuation: {
    tokenize: Ou
  },
  exit: Du,
  name: "list",
  tokenize: Ru
}, Nu = {
  partial: !0,
  tokenize: _u
}, Au = {
  partial: !0,
  tokenize: Pu
};
function Ru(e, t, n) {
  const r = this, i = r.events[r.events.length - 1];
  let s = i && i[1].type === "linePrefix" ? i[2].sliceSerialize(i[1], !0).length : 0, o = 0;
  return a;
  function a(h) {
    const d = r.containerState.type || (h === 42 || h === 43 || h === 45 ? "listUnordered" : "listOrdered");
    if (d === "listUnordered" ? !r.containerState.marker || h === r.containerState.marker : _n(h)) {
      if (r.containerState.type || (r.containerState.type = d, e.enter(d, {
        _container: !0
      })), d === "listUnordered")
        return e.enter("listItemPrefix"), h === 42 || h === 45 ? e.check(jt, n, l)(h) : l(h);
      if (!r.interrupt || h === 49)
        return e.enter("listItemPrefix"), e.enter("listItemValue"), u(h);
    }
    return n(h);
  }
  function u(h) {
    return _n(h) && ++o < 10 ? (e.consume(h), u) : (!r.interrupt || o < 2) && (r.containerState.marker ? h === r.containerState.marker : h === 41 || h === 46) ? (e.exit("listItemValue"), l(h)) : n(h);
  }
  function l(h) {
    return e.enter("listItemMarker"), e.consume(h), e.exit("listItemMarker"), r.containerState.marker = r.containerState.marker || h, e.check(
      Tt,
      // Can’t be empty when interrupting.
      r.interrupt ? n : f,
      e.attempt(Nu, p, c)
    );
  }
  function f(h) {
    return r.containerState.initialBlankLine = !0, s++, p(h);
  }
  function c(h) {
    return H(h) ? (e.enter("listItemPrefixWhitespace"), e.consume(h), e.exit("listItemPrefixWhitespace"), p) : n(h);
  }
  function p(h) {
    return r.containerState.size = s + r.sliceSerialize(e.exit("listItemPrefix"), !0).length, t(h);
  }
}
function Ou(e, t, n) {
  const r = this;
  return r.containerState._closeFlow = void 0, e.check(Tt, i, s);
  function i(a) {
    return r.containerState.furtherBlankLines = r.containerState.furtherBlankLines || r.containerState.initialBlankLine, K(e, t, "listItemIndent", r.containerState.size + 1)(a);
  }
  function s(a) {
    return r.containerState.furtherBlankLines || !H(a) ? (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, o(a)) : (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, e.attempt(Au, t, o)(a));
  }
  function o(a) {
    return r.containerState._closeFlow = !0, r.interrupt = void 0, K(e, e.attempt(fe, t, n), "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(a);
  }
}
function Pu(e, t, n) {
  const r = this;
  return K(e, i, "listItemIndent", r.containerState.size + 1);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return o && o[1].type === "listItemIndent" && o[2].sliceSerialize(o[1], !0).length === r.containerState.size ? t(s) : n(s);
  }
}
function Du(e) {
  e.exit(this.containerState.type);
}
function _u(e, t, n) {
  const r = this;
  return K(e, i, "listItemPrefixWhitespace", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 5);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return !H(s) && o && o[1].type === "listItemPrefixWhitespace" ? t(s) : n(s);
  }
}
const ri = {
  name: "setextUnderline",
  resolveTo: Fu,
  tokenize: zu
};
function Fu(e, t) {
  let n = e.length, r, i, s;
  for (; n--; )
    if (e[n][0] === "enter") {
      if (e[n][1].type === "content") {
        r = n;
        break;
      }
      e[n][1].type === "paragraph" && (i = n);
    } else
      e[n][1].type === "content" && e.splice(n, 1), !s && e[n][1].type === "definition" && (s = n);
  const o = {
    type: "setextHeading",
    start: {
      ...e[r][1].start
    },
    end: {
      ...e[e.length - 1][1].end
    }
  };
  return e[i][1].type = "setextHeadingText", s ? (e.splice(i, 0, ["enter", o, t]), e.splice(s + 1, 0, ["exit", e[r][1], t]), e[r][1].end = {
    ...e[s][1].end
  }) : e[r][1] = o, e.push(["exit", o, t]), e;
}
function zu(e, t, n) {
  const r = this;
  let i;
  return s;
  function s(l) {
    let f = r.events.length, c;
    for (; f--; )
      if (r.events[f][1].type !== "lineEnding" && r.events[f][1].type !== "linePrefix" && r.events[f][1].type !== "content") {
        c = r.events[f][1].type === "paragraph";
        break;
      }
    return !r.parser.lazy[r.now().line] && (r.interrupt || c) ? (e.enter("setextHeadingLine"), i = l, o(l)) : n(l);
  }
  function o(l) {
    return e.enter("setextHeadingLineSequence"), a(l);
  }
  function a(l) {
    return l === i ? (e.consume(l), a) : (e.exit("setextHeadingLineSequence"), H(l) ? K(e, u, "lineSuffix")(l) : u(l));
  }
  function u(l) {
    return l === null || F(l) ? (e.exit("setextHeadingLine"), t(l)) : n(l);
  }
}
const Mu = {
  tokenize: ju
};
function ju(e) {
  const t = this, n = e.attempt(
    // Try to parse a blank line.
    Tt,
    r,
    // Try to parse initial flow (essentially, only code).
    e.attempt(this.parser.constructs.flowInitial, i, K(e, e.attempt(this.parser.constructs.flow, i, e.attempt(Vl, i)), "linePrefix"))
  );
  return n;
  function r(s) {
    if (s === null) {
      e.consume(s);
      return;
    }
    return e.enter("lineEndingBlank"), e.consume(s), e.exit("lineEndingBlank"), t.currentConstruct = void 0, n;
  }
  function i(s) {
    if (s === null) {
      e.consume(s);
      return;
    }
    return e.enter("lineEnding"), e.consume(s), e.exit("lineEnding"), t.currentConstruct = void 0, n;
  }
}
const $u = {
  resolveAll: gs()
}, Bu = ds("string"), Uu = ds("text");
function ds(e) {
  return {
    resolveAll: gs(e === "text" ? Hu : void 0),
    tokenize: t
  };
  function t(n) {
    const r = this, i = this.parser.constructs[e], s = n.attempt(i, o, a);
    return o;
    function o(f) {
      return l(f) ? s(f) : a(f);
    }
    function a(f) {
      if (f === null) {
        n.consume(f);
        return;
      }
      return n.enter("data"), n.consume(f), u;
    }
    function u(f) {
      return l(f) ? (n.exit("data"), s(f)) : (n.consume(f), u);
    }
    function l(f) {
      if (f === null)
        return !0;
      const c = i[f];
      let p = -1;
      if (c)
        for (; ++p < c.length; ) {
          const h = c[p];
          if (!h.previous || h.previous.call(r, r.previous))
            return !0;
        }
      return !1;
    }
  }
}
function gs(e) {
  return t;
  function t(n, r) {
    let i = -1, s;
    for (; ++i <= n.length; )
      s === void 0 ? n[i] && n[i][1].type === "data" && (s = i, i++) : (!n[i] || n[i][1].type !== "data") && (i !== s + 2 && (n[s][1].end = n[i - 1][1].end, n.splice(s + 2, i - s - 2), i = s + 2), s = void 0);
    return e ? e(n, r) : n;
  }
}
function Hu(e, t) {
  let n = 0;
  for (; ++n <= e.length; )
    if ((n === e.length || e[n][1].type === "lineEnding") && e[n - 1][1].type === "data") {
      const r = e[n - 1][1], i = t.sliceStream(r);
      let s = i.length, o = -1, a = 0, u;
      for (; s--; ) {
        const l = i[s];
        if (typeof l == "string") {
          for (o = l.length; l.charCodeAt(o - 1) === 32; )
            a++, o--;
          if (o) break;
          o = -1;
        } else if (l === -2)
          u = !0, a++;
        else if (l !== -1) {
          s++;
          break;
        }
      }
      if (t._contentTypeTextTrailing && n === e.length && (a = 0), a) {
        const l = {
          type: n === e.length || u || a < 2 ? "lineSuffix" : "hardBreakTrailing",
          start: {
            _bufferIndex: s ? o : r.start._bufferIndex + o,
            _index: r.start._index + s,
            line: r.end.line,
            column: r.end.column - a,
            offset: r.end.offset - a
          },
          end: {
            ...r.end
          }
        };
        r.end = {
          ...l.start
        }, r.start.offset === r.end.offset ? Object.assign(r, l) : (e.splice(n, 0, ["enter", l, t], ["exit", l, t]), n += 2);
      }
      n++;
    }
  return e;
}
const Vu = {
  42: fe,
  43: fe,
  45: fe,
  48: fe,
  49: fe,
  50: fe,
  51: fe,
  52: fe,
  53: fe,
  54: fe,
  55: fe,
  56: fe,
  57: fe,
  62: as
}, qu = {
  91: Jl
}, Ku = {
  [-2]: fn,
  [-1]: fn,
  32: fn
}, Wu = {
  35: tu,
  42: jt,
  45: [ri, jt],
  60: su,
  61: ri,
  95: jt,
  96: ti,
  126: ti
}, Gu = {
  38: us,
  92: ls
}, Ju = {
  [-5]: hn,
  [-4]: hn,
  [-3]: hn,
  33: vu,
  38: us,
  42: Fn,
  60: [El, hu],
  91: Eu,
  92: [Zl, ls],
  93: Xn,
  95: Fn,
  96: Ml
}, Yu = {
  null: [Fn, $u]
}, Qu = {
  null: [42, 95]
}, Xu = {
  null: []
}, Zu = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  attentionMarkers: Qu,
  contentInitial: qu,
  disable: Xu,
  document: Vu,
  flow: Wu,
  flowInitial: Ku,
  insideSpan: Yu,
  string: Gu,
  text: Ju
}, Symbol.toStringTag, { value: "Module" }));
function ec(e, t, n) {
  let r = {
    _bufferIndex: -1,
    _index: 0,
    line: n && n.line || 1,
    column: n && n.column || 1,
    offset: n && n.offset || 0
  };
  const i = {}, s = [];
  let o = [], a = [];
  const u = {
    attempt: z(O),
    check: z(S),
    consume: v,
    enter: w,
    exit: I,
    interrupt: z(S, {
      interrupt: !0
    })
  }, l = {
    code: null,
    containerState: {},
    defineSkip: y,
    events: [],
    now: d,
    parser: e,
    previous: null,
    sliceSerialize: p,
    sliceStream: h,
    write: c
  };
  let f = t.tokenize.call(l, u);
  return t.resolveAll && s.push(t), l;
  function c(L) {
    return o = ye(o, L), x(), o[o.length - 1] !== null ? [] : (V(t, 0), l.events = Jt(s, l.events, l), l.events);
  }
  function p(L, R) {
    return nc(h(L), R);
  }
  function h(L) {
    return tc(o, L);
  }
  function d() {
    const {
      _bufferIndex: L,
      _index: R,
      line: _,
      column: P,
      offset: A
    } = r;
    return {
      _bufferIndex: L,
      _index: R,
      line: _,
      column: P,
      offset: A
    };
  }
  function y(L) {
    i[L.line] = L.column, k();
  }
  function x() {
    let L;
    for (; r._index < o.length; ) {
      const R = o[r._index];
      if (typeof R == "string")
        for (L = r._index, r._bufferIndex < 0 && (r._bufferIndex = 0); r._index === L && r._bufferIndex < R.length; )
          b(R.charCodeAt(r._bufferIndex));
      else
        b(R);
    }
  }
  function b(L) {
    f = f(L);
  }
  function v(L) {
    F(L) ? (r.line++, r.column = 1, r.offset += L === -3 ? 2 : 1, k()) : L !== -1 && (r.column++, r.offset++), r._bufferIndex < 0 ? r._index++ : (r._bufferIndex++, r._bufferIndex === // Points w/ non-negative `_bufferIndex` reference
    // strings.
    /** @type {string} */
    o[r._index].length && (r._bufferIndex = -1, r._index++)), l.previous = L;
  }
  function w(L, R) {
    const _ = R || {};
    return _.type = L, _.start = d(), l.events.push(["enter", _, l]), a.push(_), _;
  }
  function I(L) {
    const R = a.pop();
    return R.end = d(), l.events.push(["exit", R, l]), R;
  }
  function O(L, R) {
    V(L, R.from);
  }
  function S(L, R) {
    R.restore();
  }
  function z(L, R) {
    return _;
    function _(P, A, U) {
      let W, te, ue, g;
      return Array.isArray(P) ? (
        /* c8 ignore next 1 */
        ne(P)
      ) : "tokenize" in P ? (
        // Looks like a construct.
        ne([
          /** @type {Construct} */
          P
        ])
      ) : Q(P);
      function Q(re) {
        return at;
        function at(Ae) {
          const Ye = Ae !== null && re[Ae], Qe = Ae !== null && re.null, Nt = [
            // To do: add more extension tests.
            /* c8 ignore next 2 */
            ...Array.isArray(Ye) ? Ye : Ye ? [Ye] : [],
            ...Array.isArray(Qe) ? Qe : Qe ? [Qe] : []
          ];
          return ne(Nt)(Ae);
        }
      }
      function ne(re) {
        return W = re, te = 0, re.length === 0 ? U : m(re[te]);
      }
      function m(re) {
        return at;
        function at(Ae) {
          return g = D(), ue = re, re.partial || (l.currentConstruct = re), re.name && l.parser.constructs.disable.null.includes(re.name) ? ze() : re.tokenize.call(
            // If we do have fields, create an object w/ `context` as its
            // prototype.
            // This allows a “live binding”, which is needed for `interrupt`.
            R ? Object.assign(Object.create(l), R) : l,
            u,
            ce,
            ze
          )(Ae);
        }
      }
      function ce(re) {
        return L(ue, g), A;
      }
      function ze(re) {
        return g.restore(), ++te < W.length ? m(W[te]) : U;
      }
    }
  }
  function V(L, R) {
    L.resolveAll && !s.includes(L) && s.push(L), L.resolve && me(l.events, R, l.events.length - R, L.resolve(l.events.slice(R), l)), L.resolveTo && (l.events = L.resolveTo(l.events, l));
  }
  function D() {
    const L = d(), R = l.previous, _ = l.currentConstruct, P = l.events.length, A = Array.from(a);
    return {
      from: P,
      restore: U
    };
    function U() {
      r = L, l.previous = R, l.currentConstruct = _, l.events.length = P, a = A, k();
    }
  }
  function k() {
    r.line in i && r.column < 2 && (r.column = i[r.line], r.offset += i[r.line] - 1);
  }
}
function tc(e, t) {
  const n = t.start._index, r = t.start._bufferIndex, i = t.end._index, s = t.end._bufferIndex;
  let o;
  if (n === i)
    o = [e[n].slice(r, s)];
  else {
    if (o = e.slice(n, i), r > -1) {
      const a = o[0];
      typeof a == "string" ? o[0] = a.slice(r) : o.shift();
    }
    s > 0 && o.push(e[i].slice(0, s));
  }
  return o;
}
function nc(e, t) {
  let n = -1;
  const r = [];
  let i;
  for (; ++n < e.length; ) {
    const s = e[n];
    let o;
    if (typeof s == "string")
      o = s;
    else switch (s) {
      case -5: {
        o = "\r";
        break;
      }
      case -4: {
        o = `
`;
        break;
      }
      case -3: {
        o = `\r
`;
        break;
      }
      case -2: {
        o = t ? " " : "	";
        break;
      }
      case -1: {
        if (!t && i) continue;
        o = " ";
        break;
      }
      default:
        o = String.fromCharCode(s);
    }
    i = s === -2, r.push(o);
  }
  return r.join("");
}
function rc(e) {
  const r = {
    constructs: (
      /** @type {FullNormalizedExtension} */
      ss([Zu, ...(e || {}).extensions || []])
    ),
    content: i(bl),
    defined: [],
    document: i(kl),
    flow: i(Mu),
    lazy: {},
    string: i(Bu),
    text: i(Uu)
  };
  return r;
  function i(s) {
    return o;
    function o(a) {
      return ec(r, s, a);
    }
  }
}
function ic(e) {
  for (; !cs(e); )
    ;
  return e;
}
const ii = /[\0\t\n\r]/g;
function sc() {
  let e = 1, t = "", n = !0, r;
  return i;
  function i(s, o, a) {
    const u = [];
    let l, f, c, p, h;
    for (s = t + (typeof s == "string" ? s.toString() : new TextDecoder(o || void 0).decode(s)), c = 0, t = "", n && (s.charCodeAt(0) === 65279 && c++, n = void 0); c < s.length; ) {
      if (ii.lastIndex = c, l = ii.exec(s), p = l && l.index !== void 0 ? l.index : s.length, h = s.charCodeAt(p), !l) {
        t = s.slice(c);
        break;
      }
      if (h === 10 && c === p && r)
        u.push(-3), r = void 0;
      else
        switch (r && (u.push(-5), r = void 0), c < p && (u.push(s.slice(c, p)), e += p - c), h) {
          case 0: {
            u.push(65533), e++;
            break;
          }
          case 9: {
            for (f = Math.ceil(e / 4) * 4, u.push(-2); e++ < f; ) u.push(-1);
            break;
          }
          case 10: {
            u.push(-4), e = 1;
            break;
          }
          default:
            r = !0, e = 1;
        }
      c = p + 1;
    }
    return a && (r && u.push(-5), t && u.push(t), u.push(null)), u;
  }
}
const oc = /\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;
function ac(e) {
  return e.replace(oc, lc);
}
function lc(e, t, n) {
  if (t)
    return t;
  if (n.charCodeAt(0) === 35) {
    const i = n.charCodeAt(1), s = i === 120 || i === 88;
    return os(n.slice(s ? 2 : 1), s ? 16 : 10);
  }
  return Qn(n) || e;
}
const ms = {}.hasOwnProperty;
function uc(e, t, n) {
  return t && typeof t == "object" && (n = t, t = void 0), cc(n)(ic(rc(n).document().write(sc()(e, t, !0))));
}
function cc(e) {
  const t = {
    transforms: [],
    canContainEols: ["emphasis", "fragment", "heading", "paragraph", "strong"],
    enter: {
      autolink: s(fr),
      autolinkProtocol: D,
      autolinkEmail: D,
      atxHeading: s(lr),
      blockQuote: s(Qe),
      characterEscape: D,
      characterReference: D,
      codeFenced: s(Nt),
      codeFencedFenceInfo: o,
      codeFencedFenceMeta: o,
      codeIndented: s(Nt, o),
      codeText: s(Xs, o),
      codeTextData: D,
      data: D,
      codeFlowValue: D,
      definition: s(Zs),
      definitionDestinationString: o,
      definitionLabelString: o,
      definitionTitleString: o,
      emphasis: s(eo),
      hardBreakEscape: s(ur),
      hardBreakTrailing: s(ur),
      htmlFlow: s(cr, o),
      htmlFlowData: D,
      htmlText: s(cr, o),
      htmlTextData: D,
      image: s(to),
      label: o,
      link: s(fr),
      listItem: s(no),
      listItemValue: p,
      listOrdered: s(hr, c),
      listUnordered: s(hr),
      paragraph: s(ro),
      reference: m,
      referenceString: o,
      resourceDestinationString: o,
      resourceTitleString: o,
      setextHeading: s(lr),
      strong: s(io),
      thematicBreak: s(oo)
    },
    exit: {
      atxHeading: u(),
      atxHeadingSequence: O,
      autolink: u(),
      autolinkEmail: Ye,
      autolinkProtocol: Ae,
      blockQuote: u(),
      characterEscapeValue: k,
      characterReferenceMarkerHexadecimal: ze,
      characterReferenceMarkerNumeric: ze,
      characterReferenceValue: re,
      characterReference: at,
      codeFenced: u(x),
      codeFencedFence: y,
      codeFencedFenceInfo: h,
      codeFencedFenceMeta: d,
      codeFlowValue: k,
      codeIndented: u(b),
      codeText: u(A),
      codeTextData: k,
      data: k,
      definition: u(),
      definitionDestinationString: I,
      definitionLabelString: v,
      definitionTitleString: w,
      emphasis: u(),
      hardBreakEscape: u(R),
      hardBreakTrailing: u(R),
      htmlFlow: u(_),
      htmlFlowData: k,
      htmlText: u(P),
      htmlTextData: k,
      image: u(W),
      label: ue,
      labelText: te,
      lineEnding: L,
      link: u(U),
      listItem: u(),
      listOrdered: u(),
      listUnordered: u(),
      paragraph: u(),
      referenceString: ce,
      resourceDestinationString: g,
      resourceTitleString: Q,
      resource: ne,
      setextHeading: u(V),
      setextHeadingLineSequence: z,
      setextHeadingText: S,
      strong: u(),
      thematicBreak: u()
    }
  };
  ys(t, (e || {}).mdastExtensions || []);
  const n = {};
  return r;
  function r(C) {
    let N = {
      type: "root",
      children: []
    };
    const B = {
      stack: [N],
      tokenStack: [],
      config: t,
      enter: a,
      exit: l,
      buffer: o,
      resume: f,
      data: n
    }, q = [];
    let G = -1;
    for (; ++G < C.length; )
      if (C[G][1].type === "listOrdered" || C[G][1].type === "listUnordered")
        if (C[G][0] === "enter")
          q.push(G);
        else {
          const ke = q.pop();
          G = i(C, ke, G);
        }
    for (G = -1; ++G < C.length; ) {
      const ke = t[C[G][0]];
      ms.call(ke, C[G][1].type) && ke[C[G][1].type].call(Object.assign({
        sliceSerialize: C[G][2].sliceSerialize
      }, B), C[G][1]);
    }
    if (B.tokenStack.length > 0) {
      const ke = B.tokenStack[B.tokenStack.length - 1];
      (ke[1] || si).call(B, void 0, ke[0]);
    }
    for (N.position = {
      start: Re(C.length > 0 ? C[0][1].start : {
        line: 1,
        column: 1,
        offset: 0
      }),
      end: Re(C.length > 0 ? C[C.length - 2][1].end : {
        line: 1,
        column: 1,
        offset: 0
      })
    }, G = -1; ++G < t.transforms.length; )
      N = t.transforms[G](N) || N;
    return N;
  }
  function i(C, N, B) {
    let q = N - 1, G = -1, ke = !1, Me, Ie, lt, ut;
    for (; ++q <= B; ) {
      const de = C[q];
      switch (de[1].type) {
        case "listUnordered":
        case "listOrdered":
        case "blockQuote": {
          de[0] === "enter" ? G++ : G--, ut = void 0;
          break;
        }
        case "lineEndingBlank": {
          de[0] === "enter" && (Me && !ut && !G && !lt && (lt = q), ut = void 0);
          break;
        }
        case "linePrefix":
        case "listItemValue":
        case "listItemMarker":
        case "listItemPrefix":
        case "listItemPrefixWhitespace":
          break;
        default:
          ut = void 0;
      }
      if (!G && de[0] === "enter" && de[1].type === "listItemPrefix" || G === -1 && de[0] === "exit" && (de[1].type === "listUnordered" || de[1].type === "listOrdered")) {
        if (Me) {
          let Xe = q;
          for (Ie = void 0; Xe--; ) {
            const Te = C[Xe];
            if (Te[1].type === "lineEnding" || Te[1].type === "lineEndingBlank") {
              if (Te[0] === "exit") continue;
              Ie && (C[Ie][1].type = "lineEndingBlank", ke = !0), Te[1].type = "lineEnding", Ie = Xe;
            } else if (!(Te[1].type === "linePrefix" || Te[1].type === "blockQuotePrefix" || Te[1].type === "blockQuotePrefixWhitespace" || Te[1].type === "blockQuoteMarker" || Te[1].type === "listItemIndent")) break;
          }
          lt && (!Ie || lt < Ie) && (Me._spread = !0), Me.end = Object.assign({}, Ie ? C[Ie][1].start : de[1].end), C.splice(Ie || q, 0, ["exit", Me, de[2]]), q++, B++;
        }
        if (de[1].type === "listItemPrefix") {
          const Xe = {
            type: "listItem",
            _spread: !1,
            start: Object.assign({}, de[1].start),
            // @ts-expect-error: we’ll add `end` in a second.
            end: void 0
          };
          Me = Xe, C.splice(q, 0, ["enter", Xe, de[2]]), q++, B++, lt = void 0, ut = !0;
        }
      }
    }
    return C[N][1]._spread = ke, B;
  }
  function s(C, N) {
    return B;
    function B(q) {
      a.call(this, C(q), q), N && N.call(this, q);
    }
  }
  function o() {
    this.stack.push({
      type: "fragment",
      children: []
    });
  }
  function a(C, N, B) {
    this.stack[this.stack.length - 1].children.push(C), this.stack.push(C), this.tokenStack.push([N, B || void 0]), C.position = {
      start: Re(N.start),
      // @ts-expect-error: `end` will be patched later.
      end: void 0
    };
  }
  function u(C) {
    return N;
    function N(B) {
      C && C.call(this, B), l.call(this, B);
    }
  }
  function l(C, N) {
    const B = this.stack.pop(), q = this.tokenStack.pop();
    if (q)
      q[0].type !== C.type && (N ? N.call(this, C, q[0]) : (q[1] || si).call(this, C, q[0]));
    else throw new Error("Cannot close `" + C.type + "` (" + xt({
      start: C.start,
      end: C.end
    }) + "): it’s not open");
    B.position.end = Re(C.end);
  }
  function f() {
    return Yn(this.stack.pop());
  }
  function c() {
    this.data.expectingFirstListItemValue = !0;
  }
  function p(C) {
    if (this.data.expectingFirstListItemValue) {
      const N = this.stack[this.stack.length - 2];
      N.start = Number.parseInt(this.sliceSerialize(C), 10), this.data.expectingFirstListItemValue = void 0;
    }
  }
  function h() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.lang = C;
  }
  function d() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.meta = C;
  }
  function y() {
    this.data.flowCodeInside || (this.buffer(), this.data.flowCodeInside = !0);
  }
  function x() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.value = C.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g, ""), this.data.flowCodeInside = void 0;
  }
  function b() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.value = C.replace(/(\r?\n|\r)$/g, "");
  }
  function v(C) {
    const N = this.resume(), B = this.stack[this.stack.length - 1];
    B.label = N, B.identifier = we(this.sliceSerialize(C)).toLowerCase();
  }
  function w() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.title = C;
  }
  function I() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.url = C;
  }
  function O(C) {
    const N = this.stack[this.stack.length - 1];
    if (!N.depth) {
      const B = this.sliceSerialize(C).length;
      N.depth = B;
    }
  }
  function S() {
    this.data.setextHeadingSlurpLineEnding = !0;
  }
  function z(C) {
    const N = this.stack[this.stack.length - 1];
    N.depth = this.sliceSerialize(C).codePointAt(0) === 61 ? 1 : 2;
  }
  function V() {
    this.data.setextHeadingSlurpLineEnding = void 0;
  }
  function D(C) {
    const B = this.stack[this.stack.length - 1].children;
    let q = B[B.length - 1];
    (!q || q.type !== "text") && (q = so(), q.position = {
      start: Re(C.start),
      // @ts-expect-error: we’ll add `end` later.
      end: void 0
    }, B.push(q)), this.stack.push(q);
  }
  function k(C) {
    const N = this.stack.pop();
    N.value += this.sliceSerialize(C), N.position.end = Re(C.end);
  }
  function L(C) {
    const N = this.stack[this.stack.length - 1];
    if (this.data.atHardBreak) {
      const B = N.children[N.children.length - 1];
      B.position.end = Re(C.end), this.data.atHardBreak = void 0;
      return;
    }
    !this.data.setextHeadingSlurpLineEnding && t.canContainEols.includes(N.type) && (D.call(this, C), k.call(this, C));
  }
  function R() {
    this.data.atHardBreak = !0;
  }
  function _() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.value = C;
  }
  function P() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.value = C;
  }
  function A() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.value = C;
  }
  function U() {
    const C = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const N = this.data.referenceType || "shortcut";
      C.type += "Reference", C.referenceType = N, delete C.url, delete C.title;
    } else
      delete C.identifier, delete C.label;
    this.data.referenceType = void 0;
  }
  function W() {
    const C = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const N = this.data.referenceType || "shortcut";
      C.type += "Reference", C.referenceType = N, delete C.url, delete C.title;
    } else
      delete C.identifier, delete C.label;
    this.data.referenceType = void 0;
  }
  function te(C) {
    const N = this.sliceSerialize(C), B = this.stack[this.stack.length - 2];
    B.label = ac(N), B.identifier = we(N).toLowerCase();
  }
  function ue() {
    const C = this.stack[this.stack.length - 1], N = this.resume(), B = this.stack[this.stack.length - 1];
    if (this.data.inReference = !0, B.type === "link") {
      const q = C.children;
      B.children = q;
    } else
      B.alt = N;
  }
  function g() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.url = C;
  }
  function Q() {
    const C = this.resume(), N = this.stack[this.stack.length - 1];
    N.title = C;
  }
  function ne() {
    this.data.inReference = void 0;
  }
  function m() {
    this.data.referenceType = "collapsed";
  }
  function ce(C) {
    const N = this.resume(), B = this.stack[this.stack.length - 1];
    B.label = N, B.identifier = we(this.sliceSerialize(C)).toLowerCase(), this.data.referenceType = "full";
  }
  function ze(C) {
    this.data.characterReferenceType = C.type;
  }
  function re(C) {
    const N = this.sliceSerialize(C), B = this.data.characterReferenceType;
    let q;
    B ? (q = os(N, B === "characterReferenceMarkerNumeric" ? 10 : 16), this.data.characterReferenceType = void 0) : q = Qn(N);
    const G = this.stack[this.stack.length - 1];
    G.value += q;
  }
  function at(C) {
    const N = this.stack.pop();
    N.position.end = Re(C.end);
  }
  function Ae(C) {
    k.call(this, C);
    const N = this.stack[this.stack.length - 1];
    N.url = this.sliceSerialize(C);
  }
  function Ye(C) {
    k.call(this, C);
    const N = this.stack[this.stack.length - 1];
    N.url = "mailto:" + this.sliceSerialize(C);
  }
  function Qe() {
    return {
      type: "blockquote",
      children: []
    };
  }
  function Nt() {
    return {
      type: "code",
      lang: null,
      meta: null,
      value: ""
    };
  }
  function Xs() {
    return {
      type: "inlineCode",
      value: ""
    };
  }
  function Zs() {
    return {
      type: "definition",
      identifier: "",
      label: null,
      title: null,
      url: ""
    };
  }
  function eo() {
    return {
      type: "emphasis",
      children: []
    };
  }
  function lr() {
    return {
      type: "heading",
      // @ts-expect-error `depth` will be set later.
      depth: 0,
      children: []
    };
  }
  function ur() {
    return {
      type: "break"
    };
  }
  function cr() {
    return {
      type: "html",
      value: ""
    };
  }
  function to() {
    return {
      type: "image",
      title: null,
      url: "",
      alt: null
    };
  }
  function fr() {
    return {
      type: "link",
      title: null,
      url: "",
      children: []
    };
  }
  function hr(C) {
    return {
      type: "list",
      ordered: C.type === "listOrdered",
      start: null,
      spread: C._spread,
      children: []
    };
  }
  function no(C) {
    return {
      type: "listItem",
      spread: C._spread,
      checked: null,
      children: []
    };
  }
  function ro() {
    return {
      type: "paragraph",
      children: []
    };
  }
  function io() {
    return {
      type: "strong",
      children: []
    };
  }
  function so() {
    return {
      type: "text",
      value: ""
    };
  }
  function oo() {
    return {
      type: "thematicBreak"
    };
  }
}
function Re(e) {
  return {
    line: e.line,
    column: e.column,
    offset: e.offset
  };
}
function ys(e, t) {
  let n = -1;
  for (; ++n < t.length; ) {
    const r = t[n];
    Array.isArray(r) ? ys(e, r) : fc(e, r);
  }
}
function fc(e, t) {
  let n;
  for (n in t)
    if (ms.call(t, n))
      switch (n) {
        case "canContainEols": {
          const r = t[n];
          r && e[n].push(...r);
          break;
        }
        case "transforms": {
          const r = t[n];
          r && e[n].push(...r);
          break;
        }
        case "enter":
        case "exit": {
          const r = t[n];
          r && Object.assign(e[n], r);
          break;
        }
      }
}
function si(e, t) {
  throw e ? new Error("Cannot close `" + e.type + "` (" + xt({
    start: e.start,
    end: e.end
  }) + "): a different token (`" + t.type + "`, " + xt({
    start: t.start,
    end: t.end
  }) + ") is open") : new Error("Cannot close document, a token (`" + t.type + "`, " + xt({
    start: t.start,
    end: t.end
  }) + ") is still open");
}
function hc(e) {
  const t = this;
  t.parser = n;
  function n(r) {
    return uc(r, {
      ...t.data("settings"),
      ...e,
      // Note: these options are not in the readme.
      // The goal is for them to be set by plugins on `data` instead of being
      // passed by users.
      extensions: t.data("micromarkExtensions") || [],
      mdastExtensions: t.data("fromMarkdownExtensions") || []
    });
  }
}
function pc(e, t) {
  const n = {
    type: "element",
    tagName: "blockquote",
    properties: {},
    children: e.wrap(e.all(t), !0)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function dc(e, t) {
  const n = { type: "element", tagName: "br", properties: {}, children: [] };
  return e.patch(t, n), [e.applyData(t, n), { type: "text", value: `
` }];
}
function gc(e, t) {
  const n = t.value ? t.value + `
` : "", r = {}, i = t.lang ? t.lang.split(/\s+/) : [];
  i.length > 0 && (r.className = ["language-" + i[0]]);
  let s = {
    type: "element",
    tagName: "code",
    properties: r,
    children: [{ type: "text", value: n }]
  };
  return t.meta && (s.data = { meta: t.meta }), e.patch(t, s), s = e.applyData(t, s), s = { type: "element", tagName: "pre", properties: {}, children: [s] }, e.patch(t, s), s;
}
function mc(e, t) {
  const n = {
    type: "element",
    tagName: "del",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function yc(e, t) {
  const n = {
    type: "element",
    tagName: "em",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function bc(e, t) {
  const n = typeof e.options.clobberPrefix == "string" ? e.options.clobberPrefix : "user-content-", r = String(t.identifier).toUpperCase(), i = ot(r.toLowerCase()), s = e.footnoteOrder.indexOf(r);
  let o, a = e.footnoteCounts.get(r);
  a === void 0 ? (a = 0, e.footnoteOrder.push(r), o = e.footnoteOrder.length) : o = s + 1, a += 1, e.footnoteCounts.set(r, a);
  const u = {
    type: "element",
    tagName: "a",
    properties: {
      href: "#" + n + "fn-" + i,
      id: n + "fnref-" + i + (a > 1 ? "-" + a : ""),
      dataFootnoteRef: !0,
      ariaDescribedBy: ["footnote-label"]
    },
    children: [{ type: "text", value: String(o) }]
  };
  e.patch(t, u);
  const l = {
    type: "element",
    tagName: "sup",
    properties: {},
    children: [u]
  };
  return e.patch(t, l), e.applyData(t, l);
}
function xc(e, t) {
  const n = {
    type: "element",
    tagName: "h" + t.depth,
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function kc(e, t) {
  if (e.options.allowDangerousHtml) {
    const n = { type: "raw", value: t.value };
    return e.patch(t, n), e.applyData(t, n);
  }
}
function bs(e, t) {
  const n = t.referenceType;
  let r = "]";
  if (n === "collapsed" ? r += "[]" : n === "full" && (r += "[" + (t.label || t.identifier) + "]"), t.type === "imageReference")
    return [{ type: "text", value: "![" + t.alt + r }];
  const i = e.all(t), s = i[0];
  s && s.type === "text" ? s.value = "[" + s.value : i.unshift({ type: "text", value: "[" });
  const o = i[i.length - 1];
  return o && o.type === "text" ? o.value += r : i.push({ type: "text", value: r }), i;
}
function wc(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return bs(e, t);
  const i = { src: ot(r.url || ""), alt: t.alt };
  r.title !== null && r.title !== void 0 && (i.title = r.title);
  const s = { type: "element", tagName: "img", properties: i, children: [] };
  return e.patch(t, s), e.applyData(t, s);
}
function Sc(e, t) {
  const n = { src: ot(t.url) };
  t.alt !== null && t.alt !== void 0 && (n.alt = t.alt), t.title !== null && t.title !== void 0 && (n.title = t.title);
  const r = { type: "element", tagName: "img", properties: n, children: [] };
  return e.patch(t, r), e.applyData(t, r);
}
function vc(e, t) {
  const n = { type: "text", value: t.value.replace(/\r?\n|\r/g, " ") };
  e.patch(t, n);
  const r = {
    type: "element",
    tagName: "code",
    properties: {},
    children: [n]
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Cc(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return bs(e, t);
  const i = { href: ot(r.url || "") };
  r.title !== null && r.title !== void 0 && (i.title = r.title);
  const s = {
    type: "element",
    tagName: "a",
    properties: i,
    children: e.all(t)
  };
  return e.patch(t, s), e.applyData(t, s);
}
function Ec(e, t) {
  const n = { href: ot(t.url) };
  t.title !== null && t.title !== void 0 && (n.title = t.title);
  const r = {
    type: "element",
    tagName: "a",
    properties: n,
    children: e.all(t)
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Ic(e, t, n) {
  const r = e.all(t), i = n ? Tc(n) : xs(t), s = {}, o = [];
  if (typeof t.checked == "boolean") {
    const f = r[0];
    let c;
    f && f.type === "element" && f.tagName === "p" ? c = f : (c = { type: "element", tagName: "p", properties: {}, children: [] }, r.unshift(c)), c.children.length > 0 && c.children.unshift({ type: "text", value: " " }), c.children.unshift({
      type: "element",
      tagName: "input",
      properties: { type: "checkbox", checked: t.checked, disabled: !0 },
      children: []
    }), s.className = ["task-list-item"];
  }
  let a = -1;
  for (; ++a < r.length; ) {
    const f = r[a];
    (i || a !== 0 || f.type !== "element" || f.tagName !== "p") && o.push({ type: "text", value: `
` }), f.type === "element" && f.tagName === "p" && !i ? o.push(...f.children) : o.push(f);
  }
  const u = r[r.length - 1];
  u && (i || u.type !== "element" || u.tagName !== "p") && o.push({ type: "text", value: `
` });
  const l = { type: "element", tagName: "li", properties: s, children: o };
  return e.patch(t, l), e.applyData(t, l);
}
function Tc(e) {
  let t = !1;
  if (e.type === "list") {
    t = e.spread || !1;
    const n = e.children;
    let r = -1;
    for (; !t && ++r < n.length; )
      t = xs(n[r]);
  }
  return t;
}
function xs(e) {
  const t = e.spread;
  return t ?? e.children.length > 1;
}
function Lc(e, t) {
  const n = {}, r = e.all(t);
  let i = -1;
  for (typeof t.start == "number" && t.start !== 1 && (n.start = t.start); ++i < r.length; ) {
    const o = r[i];
    if (o.type === "element" && o.tagName === "li" && o.properties && Array.isArray(o.properties.className) && o.properties.className.includes("task-list-item")) {
      n.className = ["contains-task-list"];
      break;
    }
  }
  const s = {
    type: "element",
    tagName: t.ordered ? "ol" : "ul",
    properties: n,
    children: e.wrap(r, !0)
  };
  return e.patch(t, s), e.applyData(t, s);
}
function Nc(e, t) {
  const n = {
    type: "element",
    tagName: "p",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Ac(e, t) {
  const n = { type: "root", children: e.wrap(e.all(t)) };
  return e.patch(t, n), e.applyData(t, n);
}
function Rc(e, t) {
  const n = {
    type: "element",
    tagName: "strong",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Oc(e, t) {
  const n = e.all(t), r = n.shift(), i = [];
  if (r) {
    const o = {
      type: "element",
      tagName: "thead",
      properties: {},
      children: e.wrap([r], !0)
    };
    e.patch(t.children[0], o), i.push(o);
  }
  if (n.length > 0) {
    const o = {
      type: "element",
      tagName: "tbody",
      properties: {},
      children: e.wrap(n, !0)
    }, a = Kn(t.children[1]), u = Xi(t.children[t.children.length - 1]);
    a && u && (o.position = { start: a, end: u }), i.push(o);
  }
  const s = {
    type: "element",
    tagName: "table",
    properties: {},
    children: e.wrap(i, !0)
  };
  return e.patch(t, s), e.applyData(t, s);
}
function Pc(e, t, n) {
  const r = n ? n.children : void 0, s = (r ? r.indexOf(t) : 1) === 0 ? "th" : "td", o = n && n.type === "table" ? n.align : void 0, a = o ? o.length : t.children.length;
  let u = -1;
  const l = [];
  for (; ++u < a; ) {
    const c = t.children[u], p = {}, h = o ? o[u] : void 0;
    h && (p.align = h);
    let d = { type: "element", tagName: s, properties: p, children: [] };
    c && (d.children = e.all(c), e.patch(c, d), d = e.applyData(c, d)), l.push(d);
  }
  const f = {
    type: "element",
    tagName: "tr",
    properties: {},
    children: e.wrap(l, !0)
  };
  return e.patch(t, f), e.applyData(t, f);
}
function Dc(e, t) {
  const n = {
    type: "element",
    tagName: "td",
    // Assume body cell.
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
const oi = 9, ai = 32;
function _c(e) {
  const t = String(e), n = /\r?\n|\r/g;
  let r = n.exec(t), i = 0;
  const s = [];
  for (; r; )
    s.push(
      li(t.slice(i, r.index), i > 0, !0),
      r[0]
    ), i = r.index + r[0].length, r = n.exec(t);
  return s.push(li(t.slice(i), i > 0, !1)), s.join("");
}
function li(e, t, n) {
  let r = 0, i = e.length;
  if (t) {
    let s = e.codePointAt(r);
    for (; s === oi || s === ai; )
      r++, s = e.codePointAt(r);
  }
  if (n) {
    let s = e.codePointAt(i - 1);
    for (; s === oi || s === ai; )
      i--, s = e.codePointAt(i - 1);
  }
  return i > r ? e.slice(r, i) : "";
}
function Fc(e, t) {
  const n = { type: "text", value: _c(String(t.value)) };
  return e.patch(t, n), e.applyData(t, n);
}
function zc(e, t) {
  const n = {
    type: "element",
    tagName: "hr",
    properties: {},
    children: []
  };
  return e.patch(t, n), e.applyData(t, n);
}
const Mc = {
  blockquote: pc,
  break: dc,
  code: gc,
  delete: mc,
  emphasis: yc,
  footnoteReference: bc,
  heading: xc,
  html: kc,
  imageReference: wc,
  image: Sc,
  inlineCode: vc,
  linkReference: Cc,
  link: Ec,
  listItem: Ic,
  list: Lc,
  paragraph: Nc,
  // @ts-expect-error: root is different, but hard to type.
  root: Ac,
  strong: Rc,
  table: Oc,
  tableCell: Dc,
  tableRow: Pc,
  text: Fc,
  thematicBreak: zc,
  toml: Ot,
  yaml: Ot,
  definition: Ot,
  footnoteDefinition: Ot
};
function Ot() {
}
const ks = -1, Yt = 0, wt = 1, Vt = 2, Zn = 3, er = 4, tr = 5, nr = 6, ws = 7, Ss = 8, vs = typeof self == "object" ? self : globalThis, ui = (e, t) => {
  switch (e) {
    case "Function":
    case "SharedWorker":
    case "Worker":
    case "eval":
    case "setInterval":
    case "setTimeout":
      throw new TypeError("unable to deserialize " + e);
  }
  return new vs[e](t);
}, jc = (e, t) => {
  const n = (i, s) => (e.set(s, i), i), r = (i) => {
    if (e.has(i))
      return e.get(i);
    const [s, o] = t[i];
    switch (s) {
      case Yt:
      case ks:
        return n(o, i);
      case wt: {
        const a = n([], i);
        for (const u of o)
          a.push(r(u));
        return a;
      }
      case Vt: {
        const a = n({}, i);
        for (const [u, l] of o)
          a[r(u)] = r(l);
        return a;
      }
      case Zn:
        return n(new Date(o), i);
      case er: {
        const { source: a, flags: u } = o;
        return n(new RegExp(a, u), i);
      }
      case tr: {
        const a = n(/* @__PURE__ */ new Map(), i);
        for (const [u, l] of o)
          a.set(r(u), r(l));
        return a;
      }
      case nr: {
        const a = n(/* @__PURE__ */ new Set(), i);
        for (const u of o)
          a.add(r(u));
        return a;
      }
      case ws: {
        const { name: a, message: u } = o;
        return n(
          typeof vs[a] == "function" ? ui(a, u) : new Error(u),
          i
        );
      }
      case Ss:
        return n(BigInt(o), i);
      case "BigInt":
        return n(Object(BigInt(o)), i);
      case "ArrayBuffer":
        return n(new Uint8Array(o).buffer, o);
      case "DataView": {
        const { buffer: a } = new Uint8Array(o);
        return n(new DataView(a), o);
      }
    }
    return n(ui(s, o), i);
  };
  return r;
}, ci = (e) => jc(/* @__PURE__ */ new Map(), e)(0), $e = "", { toString: $c } = {}, { keys: Bc } = Object, gt = (e) => {
  const t = typeof e;
  if (t !== "object" || !e)
    return [Yt, t];
  const n = $c.call(e).slice(8, -1);
  switch (n) {
    case "Array":
      return [wt, $e];
    case "Object":
      return [Vt, $e];
    case "Date":
      return [Zn, $e];
    case "RegExp":
      return [er, $e];
    case "Map":
      return [tr, $e];
    case "Set":
      return [nr, $e];
    case "DataView":
      return [wt, n];
  }
  return n.includes("Array") ? [wt, n] : e instanceof Error ? [ws, e.name || "Error"] : [Vt, n];
}, Pt = ([e, t]) => e === Yt && (t === "function" || t === "symbol"), Uc = (e, t, n, r) => {
  const i = (o, a) => {
    const u = r.push(o) - 1;
    return n.set(a, u), u;
  }, s = (o) => {
    if (n.has(o))
      return n.get(o);
    let [a, u] = gt(o);
    switch (a) {
      case Yt: {
        let f = o;
        switch (u) {
          case "bigint":
            a = Ss, f = o.toString();
            break;
          case "function":
          case "symbol":
            if (e)
              throw new TypeError("unable to serialize " + u);
            f = null;
            break;
          case "undefined":
            return i([ks], o);
        }
        return i([a, f], o);
      }
      case wt: {
        if (u) {
          let p = o;
          return u === "DataView" ? p = new Uint8Array(o.buffer) : u === "ArrayBuffer" && (p = new Uint8Array(o)), i([u, [...p]], o);
        }
        const f = [], c = i([a, f], o);
        for (const p of o)
          f.push(s(p));
        return c;
      }
      case Vt: {
        if (u)
          switch (u) {
            case "BigInt":
              return i([u, o.toString()], o);
            case "Boolean":
            case "Number":
            case "String":
              return i([u, o.valueOf()], o);
          }
        if (t && "toJSON" in o)
          return s(o.toJSON());
        const f = [], c = i([a, f], o);
        for (const p of Bc(o))
          (e || !Pt(gt(o[p]))) && f.push([s(p), s(o[p])]);
        return c;
      }
      case Zn:
        return i([a, isNaN(o.getTime()) ? $e : o.toISOString()], o);
      case er: {
        const { source: f, flags: c } = o;
        return i([a, { source: f, flags: c }], o);
      }
      case tr: {
        const f = [], c = i([a, f], o);
        for (const [p, h] of o)
          (e || !(Pt(gt(p)) || Pt(gt(h)))) && f.push([s(p), s(h)]);
        return c;
      }
      case nr: {
        const f = [], c = i([a, f], o);
        for (const p of o)
          (e || !Pt(gt(p))) && f.push(s(p));
        return c;
      }
    }
    const { message: l } = o;
    return i([a, { name: u, message: l }], o);
  };
  return s;
}, fi = (e, { json: t, lossy: n } = {}) => {
  const r = [];
  return Uc(!(t || n), !!t, /* @__PURE__ */ new Map(), r)(e), r;
}, qt = typeof structuredClone == "function" ? (
  /* c8 ignore start */
  (e, t) => t && ("json" in t || "lossy" in t) ? ci(fi(e, t)) : structuredClone(e)
) : (e, t) => ci(fi(e, t));
function Hc(e, t) {
  const n = [{ type: "text", value: "↩" }];
  return t > 1 && n.push({
    type: "element",
    tagName: "sup",
    properties: {},
    children: [{ type: "text", value: String(t) }]
  }), n;
}
function Vc(e, t) {
  return "Back to reference " + (e + 1) + (t > 1 ? "-" + t : "");
}
function qc(e) {
  const t = typeof e.options.clobberPrefix == "string" ? e.options.clobberPrefix : "user-content-", n = e.options.footnoteBackContent || Hc, r = e.options.footnoteBackLabel || Vc, i = e.options.footnoteLabel || "Footnotes", s = e.options.footnoteLabelTagName || "h2", o = e.options.footnoteLabelProperties || {
    className: ["sr-only"]
  }, a = [];
  let u = -1;
  for (; ++u < e.footnoteOrder.length; ) {
    const l = e.footnoteById.get(
      e.footnoteOrder[u]
    );
    if (!l)
      continue;
    const f = e.all(l), c = String(l.identifier).toUpperCase(), p = ot(c.toLowerCase());
    let h = 0;
    const d = [], y = e.footnoteCounts.get(c);
    for (; y !== void 0 && ++h <= y; ) {
      d.length > 0 && d.push({ type: "text", value: " " });
      let v = typeof n == "string" ? n : n(u, h);
      typeof v == "string" && (v = { type: "text", value: v }), d.push({
        type: "element",
        tagName: "a",
        properties: {
          href: "#" + t + "fnref-" + p + (h > 1 ? "-" + h : ""),
          dataFootnoteBackref: "",
          ariaLabel: typeof r == "string" ? r : r(u, h),
          className: ["data-footnote-backref"]
        },
        children: Array.isArray(v) ? v : [v]
      });
    }
    const x = f[f.length - 1];
    if (x && x.type === "element" && x.tagName === "p") {
      const v = x.children[x.children.length - 1];
      v && v.type === "text" ? v.value += " " : x.children.push({ type: "text", value: " " }), x.children.push(...d);
    } else
      f.push(...d);
    const b = {
      type: "element",
      tagName: "li",
      properties: { id: t + "fn-" + p },
      children: e.wrap(f, !0)
    };
    e.patch(l, b), a.push(b);
  }
  if (a.length !== 0)
    return {
      type: "element",
      tagName: "section",
      properties: { dataFootnotes: !0, className: ["footnotes"] },
      children: [
        {
          type: "element",
          tagName: s,
          properties: {
            ...qt(o),
            id: "footnote-label"
          },
          children: [{ type: "text", value: i }]
        },
        { type: "text", value: `
` },
        {
          type: "element",
          tagName: "ol",
          properties: {},
          children: e.wrap(a, !0)
        },
        { type: "text", value: `
` }
      ]
    };
}
const Qt = (
  // Note: overloads in JSDoc can’t yet use different `@template`s.
  /**
   * @type {(
   *   (<Condition extends string>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & {type: Condition}) &
   *   (<Condition extends Props>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & Condition) &
   *   (<Condition extends TestFunction>(test: Condition) => (node: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node & Predicate<Condition, Node>) &
   *   ((test?: null | undefined) => (node?: unknown, index?: number | null | undefined, parent?: Parent | null | undefined, context?: unknown) => node is Node) &
   *   ((test?: Test) => Check)
   * )}
   */
  /**
   * @param {Test} [test]
   * @returns {Check}
   */
  (function(e) {
    if (e == null)
      return Jc;
    if (typeof e == "function")
      return Xt(e);
    if (typeof e == "object")
      return Array.isArray(e) ? Kc(e) : (
        // Cast because `ReadonlyArray` goes into the above but `isArray`
        // narrows to `Array`.
        Wc(
          /** @type {Props} */
          e
        )
      );
    if (typeof e == "string")
      return Gc(e);
    throw new Error("Expected function, string, or object as test");
  })
);
function Kc(e) {
  const t = [];
  let n = -1;
  for (; ++n < e.length; )
    t[n] = Qt(e[n]);
  return Xt(r);
  function r(...i) {
    let s = -1;
    for (; ++s < t.length; )
      if (t[s].apply(this, i)) return !0;
    return !1;
  }
}
function Wc(e) {
  const t = (
    /** @type {Record<string, unknown>} */
    e
  );
  return Xt(n);
  function n(r) {
    const i = (
      /** @type {Record<string, unknown>} */
      /** @type {unknown} */
      r
    );
    let s;
    for (s in e)
      if (i[s] !== t[s]) return !1;
    return !0;
  }
}
function Gc(e) {
  return Xt(t);
  function t(n) {
    return n && n.type === e;
  }
}
function Xt(e) {
  return t;
  function t(n, r, i) {
    return !!(Yc(n) && e.call(
      this,
      n,
      typeof r == "number" ? r : void 0,
      i || void 0
    ));
  }
}
function Jc() {
  return !0;
}
function Yc(e) {
  return e !== null && typeof e == "object" && "type" in e;
}
const Cs = [], Qc = !0, zn = !1, Xc = "skip";
function Es(e, t, n, r) {
  let i;
  typeof t == "function" && typeof n != "function" ? (r = n, n = t) : i = t;
  const s = Qt(i), o = r ? -1 : 1;
  a(e, void 0, [])();
  function a(u, l, f) {
    const c = (
      /** @type {Record<string, unknown>} */
      u && typeof u == "object" ? u : {}
    );
    if (typeof c.type == "string") {
      const h = (
        // `hast`
        typeof c.tagName == "string" ? c.tagName : (
          // `xast`
          typeof c.name == "string" ? c.name : void 0
        )
      );
      Object.defineProperty(p, "name", {
        value: "node (" + (u.type + (h ? "<" + h + ">" : "")) + ")"
      });
    }
    return p;
    function p() {
      let h = Cs, d, y, x;
      if ((!t || s(u, l, f[f.length - 1] || void 0)) && (h = Zc(n(u, f)), h[0] === zn))
        return h;
      if ("children" in u && u.children) {
        const b = (
          /** @type {UnistParent} */
          u
        );
        if (b.children && h[0] !== Xc)
          for (y = (r ? b.children.length : -1) + o, x = f.concat(b); y > -1 && y < b.children.length; ) {
            const v = b.children[y];
            if (d = a(v, y, x)(), d[0] === zn)
              return d;
            y = typeof d[1] == "number" ? d[1] : y + o;
          }
      }
      return h;
    }
  }
}
function Zc(e) {
  return Array.isArray(e) ? e : typeof e == "number" ? [Qc, e] : e == null ? Cs : [e];
}
function rr(e, t, n, r) {
  let i, s, o;
  typeof t == "function" && typeof n != "function" ? (s = void 0, o = t, i = n) : (s = t, o = n, i = r), Es(e, s, a, i);
  function a(u, l) {
    const f = l[l.length - 1], c = f ? f.children.indexOf(u) : void 0;
    return o(u, c, f);
  }
}
const Mn = {}.hasOwnProperty, ef = {};
function tf(e, t) {
  const n = t || ef, r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), o = { ...Mc, ...n.handlers }, a = {
    all: l,
    applyData: rf,
    definitionById: r,
    footnoteById: i,
    footnoteCounts: s,
    footnoteOrder: [],
    handlers: o,
    one: u,
    options: n,
    patch: nf,
    wrap: of
  };
  return rr(e, function(f) {
    if (f.type === "definition" || f.type === "footnoteDefinition") {
      const c = f.type === "definition" ? r : i, p = String(f.identifier).toUpperCase();
      c.has(p) || c.set(p, f);
    }
  }), a;
  function u(f, c) {
    const p = f.type, h = a.handlers[p];
    if (Mn.call(a.handlers, p) && h)
      return h(a, f, c);
    if (a.options.passThrough && a.options.passThrough.includes(p)) {
      if ("children" in f) {
        const { children: y, ...x } = f, b = qt(x);
        return b.children = a.all(f), b;
      }
      return qt(f);
    }
    return (a.options.unknownHandler || sf)(a, f, c);
  }
  function l(f) {
    const c = [];
    if ("children" in f) {
      const p = f.children;
      let h = -1;
      for (; ++h < p.length; ) {
        const d = a.one(p[h], f);
        if (d) {
          if (h && p[h - 1].type === "break" && (!Array.isArray(d) && d.type === "text" && (d.value = hi(d.value)), !Array.isArray(d) && d.type === "element")) {
            const y = d.children[0];
            y && y.type === "text" && (y.value = hi(y.value));
          }
          Array.isArray(d) ? c.push(...d) : c.push(d);
        }
      }
    }
    return c;
  }
}
function nf(e, t) {
  e.position && (t.position = Va(e));
}
function rf(e, t) {
  let n = t;
  if (e && e.data) {
    const r = e.data.hName, i = e.data.hChildren, s = e.data.hProperties;
    if (typeof r == "string")
      if (n.type === "element")
        n.tagName = r;
      else {
        const o = "children" in n ? n.children : [n];
        n = { type: "element", tagName: r, properties: {}, children: o };
      }
    n.type === "element" && s && Object.assign(n.properties, qt(s)), "children" in n && n.children && i !== null && i !== void 0 && (n.children = i);
  }
  return n;
}
function sf(e, t) {
  const n = t.data || {}, r = "value" in t && !(Mn.call(n, "hProperties") || Mn.call(n, "hChildren")) ? { type: "text", value: t.value } : {
    type: "element",
    tagName: "div",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, r), e.applyData(t, r);
}
function of(e, t) {
  const n = [];
  let r = -1;
  for (t && n.push({ type: "text", value: `
` }); ++r < e.length; )
    r && n.push({ type: "text", value: `
` }), n.push(e[r]);
  return t && e.length > 0 && n.push({ type: "text", value: `
` }), n;
}
function hi(e) {
  let t = 0, n = e.charCodeAt(t);
  for (; n === 9 || n === 32; )
    t++, n = e.charCodeAt(t);
  return e.slice(t);
}
function pi(e, t) {
  const n = tf(e, t), r = n.one(e, void 0), i = qc(n), s = Array.isArray(r) ? { type: "root", children: r } : r || { type: "root", children: [] };
  return i && s.children.push({ type: "text", value: `
` }, i), s;
}
function af(e, t) {
  return e && "run" in e ? async function(n, r) {
    const i = (
      /** @type {HastRoot} */
      pi(n, { file: r, ...t })
    );
    await e.run(i, r);
  } : function(n, r) {
    return (
      /** @type {HastRoot} */
      pi(n, { file: r, ...e || t })
    );
  };
}
function di(e) {
  if (e)
    throw e;
}
var pn, gi;
function lf() {
  if (gi) return pn;
  gi = 1;
  var e = Object.prototype.hasOwnProperty, t = Object.prototype.toString, n = Object.defineProperty, r = Object.getOwnPropertyDescriptor, i = function(l) {
    return typeof Array.isArray == "function" ? Array.isArray(l) : t.call(l) === "[object Array]";
  }, s = function(l) {
    if (!l || t.call(l) !== "[object Object]")
      return !1;
    var f = e.call(l, "constructor"), c = l.constructor && l.constructor.prototype && e.call(l.constructor.prototype, "isPrototypeOf");
    if (l.constructor && !f && !c)
      return !1;
    var p;
    for (p in l)
      ;
    return typeof p > "u" || e.call(l, p);
  }, o = function(l, f) {
    n && f.name === "__proto__" ? n(l, f.name, {
      enumerable: !0,
      configurable: !0,
      value: f.newValue,
      writable: !0
    }) : l[f.name] = f.newValue;
  }, a = function(l, f) {
    if (f === "__proto__")
      if (e.call(l, f)) {
        if (r)
          return r(l, f).value;
      } else return;
    return l[f];
  };
  return pn = function u() {
    var l, f, c, p, h, d, y = arguments[0], x = 1, b = arguments.length, v = !1;
    for (typeof y == "boolean" && (v = y, y = arguments[1] || {}, x = 2), (y == null || typeof y != "object" && typeof y != "function") && (y = {}); x < b; ++x)
      if (l = arguments[x], l != null)
        for (f in l)
          c = a(y, f), p = a(l, f), y !== p && (v && p && (s(p) || (h = i(p))) ? (h ? (h = !1, d = c && i(c) ? c : []) : d = c && s(c) ? c : {}, o(y, { name: f, newValue: u(v, d, p) })) : typeof p < "u" && o(y, { name: f, newValue: p }));
    return y;
  }, pn;
}
var uf = lf();
const dn = /* @__PURE__ */ Fi(uf);
function jn(e) {
  if (typeof e != "object" || e === null)
    return !1;
  const t = Object.getPrototypeOf(e);
  return (t === null || t === Object.prototype || Object.getPrototypeOf(t) === null) && !(Symbol.toStringTag in e) && !(Symbol.iterator in e);
}
function cf() {
  const e = [], t = { run: n, use: r };
  return t;
  function n(...i) {
    let s = -1;
    const o = i.pop();
    if (typeof o != "function")
      throw new TypeError("Expected function as last argument, not " + o);
    a(null, ...i);
    function a(u, ...l) {
      const f = e[++s];
      let c = -1;
      if (u) {
        o(u);
        return;
      }
      for (; ++c < i.length; )
        (l[c] === null || l[c] === void 0) && (l[c] = i[c]);
      i = l, f ? ff(f, a)(...l) : o(null, ...l);
    }
  }
  function r(i) {
    if (typeof i != "function")
      throw new TypeError(
        "Expected `middelware` to be a function, not " + i
      );
    return e.push(i), t;
  }
}
function ff(e, t) {
  let n;
  return r;
  function r(...o) {
    const a = e.length > o.length;
    let u;
    a && o.push(i);
    try {
      u = e.apply(this, o);
    } catch (l) {
      const f = (
        /** @type {Error} */
        l
      );
      if (a && n)
        throw f;
      return i(f);
    }
    a || (u && u.then && typeof u.then == "function" ? u.then(s, i) : u instanceof Error ? i(u) : s(u));
  }
  function i(o, ...a) {
    n || (n = !0, t(o, ...a));
  }
  function s(o) {
    i(null, o);
  }
}
const Se = { basename: hf, dirname: pf, extname: df, join: gf, sep: "/" };
function hf(e, t) {
  if (t !== void 0 && typeof t != "string")
    throw new TypeError('"ext" argument must be a string');
  Lt(e);
  let n = 0, r = -1, i = e.length, s;
  if (t === void 0 || t.length === 0 || t.length > e.length) {
    for (; i--; )
      if (e.codePointAt(i) === 47) {
        if (s) {
          n = i + 1;
          break;
        }
      } else r < 0 && (s = !0, r = i + 1);
    return r < 0 ? "" : e.slice(n, r);
  }
  if (t === e)
    return "";
  let o = -1, a = t.length - 1;
  for (; i--; )
    if (e.codePointAt(i) === 47) {
      if (s) {
        n = i + 1;
        break;
      }
    } else
      o < 0 && (s = !0, o = i + 1), a > -1 && (e.codePointAt(i) === t.codePointAt(a--) ? a < 0 && (r = i) : (a = -1, r = o));
  return n === r ? r = o : r < 0 && (r = e.length), e.slice(n, r);
}
function pf(e) {
  if (Lt(e), e.length === 0)
    return ".";
  let t = -1, n = e.length, r;
  for (; --n; )
    if (e.codePointAt(n) === 47) {
      if (r) {
        t = n;
        break;
      }
    } else r || (r = !0);
  return t < 0 ? e.codePointAt(0) === 47 ? "/" : "." : t === 1 && e.codePointAt(0) === 47 ? "//" : e.slice(0, t);
}
function df(e) {
  Lt(e);
  let t = e.length, n = -1, r = 0, i = -1, s = 0, o;
  for (; t--; ) {
    const a = e.codePointAt(t);
    if (a === 47) {
      if (o) {
        r = t + 1;
        break;
      }
      continue;
    }
    n < 0 && (o = !0, n = t + 1), a === 46 ? i < 0 ? i = t : s !== 1 && (s = 1) : i > -1 && (s = -1);
  }
  return i < 0 || n < 0 || // We saw a non-dot character immediately before the dot.
  s === 0 || // The (right-most) trimmed path component is exactly `..`.
  s === 1 && i === n - 1 && i === r + 1 ? "" : e.slice(i, n);
}
function gf(...e) {
  let t = -1, n;
  for (; ++t < e.length; )
    Lt(e[t]), e[t] && (n = n === void 0 ? e[t] : n + "/" + e[t]);
  return n === void 0 ? "." : mf(n);
}
function mf(e) {
  Lt(e);
  const t = e.codePointAt(0) === 47;
  let n = yf(e, !t);
  return n.length === 0 && !t && (n = "."), n.length > 0 && e.codePointAt(e.length - 1) === 47 && (n += "/"), t ? "/" + n : n;
}
function yf(e, t) {
  let n = "", r = 0, i = -1, s = 0, o = -1, a, u;
  for (; ++o <= e.length; ) {
    if (o < e.length)
      a = e.codePointAt(o);
    else {
      if (a === 47)
        break;
      a = 47;
    }
    if (a === 47) {
      if (!(i === o - 1 || s === 1)) if (i !== o - 1 && s === 2) {
        if (n.length < 2 || r !== 2 || n.codePointAt(n.length - 1) !== 46 || n.codePointAt(n.length - 2) !== 46) {
          if (n.length > 2) {
            if (u = n.lastIndexOf("/"), u !== n.length - 1) {
              u < 0 ? (n = "", r = 0) : (n = n.slice(0, u), r = n.length - 1 - n.lastIndexOf("/")), i = o, s = 0;
              continue;
            }
          } else if (n.length > 0) {
            n = "", r = 0, i = o, s = 0;
            continue;
          }
        }
        t && (n = n.length > 0 ? n + "/.." : "..", r = 2);
      } else
        n.length > 0 ? n += "/" + e.slice(i + 1, o) : n = e.slice(i + 1, o), r = o - i - 1;
      i = o, s = 0;
    } else a === 46 && s > -1 ? s++ : s = -1;
  }
  return n;
}
function Lt(e) {
  if (typeof e != "string")
    throw new TypeError(
      "Path must be a string. Received " + JSON.stringify(e)
    );
}
const bf = { cwd: xf };
function xf() {
  return "/";
}
function $n(e) {
  return !!(e !== null && typeof e == "object" && "href" in e && e.href && "protocol" in e && e.protocol && // @ts-expect-error: indexing is fine.
  e.auth === void 0);
}
function kf(e) {
  if (typeof e == "string")
    e = new URL(e);
  else if (!$n(e)) {
    const t = new TypeError(
      'The "path" argument must be of type string or an instance of URL. Received `' + e + "`"
    );
    throw t.code = "ERR_INVALID_ARG_TYPE", t;
  }
  if (e.protocol !== "file:") {
    const t = new TypeError("The URL must be of scheme file");
    throw t.code = "ERR_INVALID_URL_SCHEME", t;
  }
  return wf(e);
}
function wf(e) {
  if (e.hostname !== "") {
    const r = new TypeError(
      'File URL host must be "localhost" or empty on darwin'
    );
    throw r.code = "ERR_INVALID_FILE_URL_HOST", r;
  }
  const t = e.pathname;
  let n = -1;
  for (; ++n < t.length; )
    if (t.codePointAt(n) === 37 && t.codePointAt(n + 1) === 50) {
      const r = t.codePointAt(n + 2);
      if (r === 70 || r === 102) {
        const i = new TypeError(
          "File URL path must not include encoded / characters"
        );
        throw i.code = "ERR_INVALID_FILE_URL_PATH", i;
      }
    }
  return decodeURIComponent(t);
}
const gn = (
  /** @type {const} */
  [
    "history",
    "path",
    "basename",
    "stem",
    "extname",
    "dirname"
  ]
);
class Is {
  /**
   * Create a new virtual file.
   *
   * `options` is treated as:
   *
   * *   `string` or `Uint8Array` — `{value: options}`
   * *   `URL` — `{path: options}`
   * *   `VFile` — shallow copies its data over to the new file
   * *   `object` — all fields are shallow copied over to the new file
   *
   * Path related fields are set in the following order (least specific to
   * most specific): `history`, `path`, `basename`, `stem`, `extname`,
   * `dirname`.
   *
   * You cannot set `dirname` or `extname` without setting either `history`,
   * `path`, `basename`, or `stem` too.
   *
   * @param {Compatible | null | undefined} [value]
   *   File value.
   * @returns
   *   New instance.
   */
  constructor(t) {
    let n;
    t ? $n(t) ? n = { path: t } : typeof t == "string" || Sf(t) ? n = { value: t } : n = t : n = {}, this.cwd = "cwd" in n ? "" : bf.cwd(), this.data = {}, this.history = [], this.messages = [], this.value, this.map, this.result, this.stored;
    let r = -1;
    for (; ++r < gn.length; ) {
      const s = gn[r];
      s in n && n[s] !== void 0 && n[s] !== null && (this[s] = s === "history" ? [...n[s]] : n[s]);
    }
    let i;
    for (i in n)
      gn.includes(i) || (this[i] = n[i]);
  }
  /**
   * Get the basename (including extname) (example: `'index.min.js'`).
   *
   * @returns {string | undefined}
   *   Basename.
   */
  get basename() {
    return typeof this.path == "string" ? Se.basename(this.path) : void 0;
  }
  /**
   * Set basename (including extname) (`'index.min.js'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be nullified (use `file.path = file.dirname` instead).
   *
   * @param {string} basename
   *   Basename.
   * @returns {undefined}
   *   Nothing.
   */
  set basename(t) {
    yn(t, "basename"), mn(t, "basename"), this.path = Se.join(this.dirname || "", t);
  }
  /**
   * Get the parent path (example: `'~'`).
   *
   * @returns {string | undefined}
   *   Dirname.
   */
  get dirname() {
    return typeof this.path == "string" ? Se.dirname(this.path) : void 0;
  }
  /**
   * Set the parent path (example: `'~'`).
   *
   * Cannot be set if there’s no `path` yet.
   *
   * @param {string | undefined} dirname
   *   Dirname.
   * @returns {undefined}
   *   Nothing.
   */
  set dirname(t) {
    mi(this.basename, "dirname"), this.path = Se.join(t || "", this.basename);
  }
  /**
   * Get the extname (including dot) (example: `'.js'`).
   *
   * @returns {string | undefined}
   *   Extname.
   */
  get extname() {
    return typeof this.path == "string" ? Se.extname(this.path) : void 0;
  }
  /**
   * Set the extname (including dot) (example: `'.js'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be set if there’s no `path` yet.
   *
   * @param {string | undefined} extname
   *   Extname.
   * @returns {undefined}
   *   Nothing.
   */
  set extname(t) {
    if (mn(t, "extname"), mi(this.dirname, "extname"), t) {
      if (t.codePointAt(0) !== 46)
        throw new Error("`extname` must start with `.`");
      if (t.includes(".", 1))
        throw new Error("`extname` cannot contain multiple dots");
    }
    this.path = Se.join(this.dirname, this.stem + (t || ""));
  }
  /**
   * Get the full path (example: `'~/index.min.js'`).
   *
   * @returns {string}
   *   Path.
   */
  get path() {
    return this.history[this.history.length - 1];
  }
  /**
   * Set the full path (example: `'~/index.min.js'`).
   *
   * Cannot be nullified.
   * You can set a file URL (a `URL` object with a `file:` protocol) which will
   * be turned into a path with `url.fileURLToPath`.
   *
   * @param {URL | string} path
   *   Path.
   * @returns {undefined}
   *   Nothing.
   */
  set path(t) {
    $n(t) && (t = kf(t)), yn(t, "path"), this.path !== t && this.history.push(t);
  }
  /**
   * Get the stem (basename w/o extname) (example: `'index.min'`).
   *
   * @returns {string | undefined}
   *   Stem.
   */
  get stem() {
    return typeof this.path == "string" ? Se.basename(this.path, this.extname) : void 0;
  }
  /**
   * Set the stem (basename w/o extname) (example: `'index.min'`).
   *
   * Cannot contain path separators (`'/'` on unix, macOS, and browsers, `'\'`
   * on windows).
   * Cannot be nullified (use `file.path = file.dirname` instead).
   *
   * @param {string} stem
   *   Stem.
   * @returns {undefined}
   *   Nothing.
   */
  set stem(t) {
    yn(t, "stem"), mn(t, "stem"), this.path = Se.join(this.dirname || "", t + (this.extname || ""));
  }
  // Normal prototypal methods.
  /**
   * Create a fatal message for `reason` associated with the file.
   *
   * The `fatal` field of the message is set to `true` (error; file not usable)
   * and the `file` field is set to the current file path.
   * The message is added to the `messages` field on `file`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {MessageOptions | null | undefined} [options]
   * @returns {never}
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns {never}
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | MessageOptions | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {never}
   *   Never.
   * @throws {VFileMessage}
   *   Message.
   */
  fail(t, n, r) {
    const i = this.message(t, n, r);
    throw i.fatal = !0, i;
  }
  /**
   * Create an info message for `reason` associated with the file.
   *
   * The `fatal` field of the message is set to `undefined` (info; change
   * likely not needed) and the `file` field is set to the current file path.
   * The message is added to the `messages` field on `file`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {MessageOptions | null | undefined} [options]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | MessageOptions | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {VFileMessage}
   *   Message.
   */
  info(t, n, r) {
    const i = this.message(t, n, r);
    return i.fatal = void 0, i;
  }
  /**
   * Create a message for `reason` associated with the file.
   *
   * The `fatal` field of the message is set to `false` (warning; change may be
   * needed) and the `file` field is set to the current file path.
   * The message is added to the `messages` field on `file`.
   *
   * > 🪦 **Note**: also has obsolete signatures.
   *
   * @overload
   * @param {string} reason
   * @param {MessageOptions | null | undefined} [options]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {string} reason
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Node | NodeLike | null | undefined} parent
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {Point | Position | null | undefined} place
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @overload
   * @param {Error | VFileMessage} cause
   * @param {string | null | undefined} [origin]
   * @returns {VFileMessage}
   *
   * @param {Error | VFileMessage | string} causeOrReason
   *   Reason for message, should use markdown.
   * @param {Node | NodeLike | MessageOptions | Point | Position | string | null | undefined} [optionsOrParentOrPlace]
   *   Configuration (optional).
   * @param {string | null | undefined} [origin]
   *   Place in code where the message originates (example:
   *   `'my-package:my-rule'` or `'my-rule'`).
   * @returns {VFileMessage}
   *   Message.
   */
  message(t, n, r) {
    const i = new se(
      // @ts-expect-error: the overloads are fine.
      t,
      n,
      r
    );
    return this.path && (i.name = this.path + ":" + i.name, i.file = this.path), i.fatal = !1, this.messages.push(i), i;
  }
  /**
   * Serialize the file.
   *
   * > **Note**: which encodings are supported depends on the engine.
   * > For info on Node.js, see:
   * > <https://nodejs.org/api/util.html#whatwg-supported-encodings>.
   *
   * @param {string | null | undefined} [encoding='utf8']
   *   Character encoding to understand `value` as when it’s a `Uint8Array`
   *   (default: `'utf-8'`).
   * @returns {string}
   *   Serialized file.
   */
  toString(t) {
    return this.value === void 0 ? "" : typeof this.value == "string" ? this.value : new TextDecoder(t || void 0).decode(this.value);
  }
}
function mn(e, t) {
  if (e && e.includes(Se.sep))
    throw new Error(
      "`" + t + "` cannot be a path: did not expect `" + Se.sep + "`"
    );
}
function yn(e, t) {
  if (!e)
    throw new Error("`" + t + "` cannot be empty");
}
function mi(e, t) {
  if (!e)
    throw new Error("Setting `" + t + "` requires `path` to be set too");
}
function Sf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const vf = (
  /**
   * @type {new <Parameters extends Array<unknown>, Result>(property: string | symbol) => (...parameters: Parameters) => Result}
   */
  /** @type {unknown} */
  /**
   * @this {Function}
   * @param {string | symbol} property
   * @returns {(...parameters: Array<unknown>) => unknown}
   */
  (function(e) {
    const r = (
      /** @type {Record<string | symbol, Function>} */
      // Prototypes do exist.
      // type-coverage:ignore-next-line
      this.constructor.prototype
    ), i = r[e], s = function() {
      return i.apply(s, arguments);
    };
    return Object.setPrototypeOf(s, r), s;
  })
), Cf = {}.hasOwnProperty;
class ir extends vf {
  /**
   * Create a processor.
   */
  constructor() {
    super("copy"), this.Compiler = void 0, this.Parser = void 0, this.attachers = [], this.compiler = void 0, this.freezeIndex = -1, this.frozen = void 0, this.namespace = {}, this.parser = void 0, this.transformers = cf();
  }
  /**
   * Copy a processor.
   *
   * @deprecated
   *   This is a private internal method and should not be used.
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *   New *unfrozen* processor ({@linkcode Processor}) that is
   *   configured to work the same as its ancestor.
   *   When the descendant processor is configured in the future it does not
   *   affect the ancestral processor.
   */
  copy() {
    const t = (
      /** @type {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>} */
      new ir()
    );
    let n = -1;
    for (; ++n < this.attachers.length; ) {
      const r = this.attachers[n];
      t.use(...r);
    }
    return t.data(dn(!0, {}, this.namespace)), t;
  }
  /**
   * Configure the processor with info available to all plugins.
   * Information is stored in an object.
   *
   * Typically, options can be given to a specific plugin, but sometimes it
   * makes sense to have information shared with several plugins.
   * For example, a list of HTML elements that are self-closing, which is
   * needed during all phases.
   *
   * > **Note**: setting information cannot occur on *frozen* processors.
   * > Call the processor first to create a new unfrozen processor.
   *
   * > **Note**: to register custom data in TypeScript, augment the
   * > {@linkcode Data} interface.
   *
   * @example
   *   This example show how to get and set info:
   *
   *   ```js
   *   import {unified} from 'unified'
   *
   *   const processor = unified().data('alpha', 'bravo')
   *
   *   processor.data('alpha') // => 'bravo'
   *
   *   processor.data() // => {alpha: 'bravo'}
   *
   *   processor.data({charlie: 'delta'})
   *
   *   processor.data() // => {charlie: 'delta'}
   *   ```
   *
   * @template {keyof Data} Key
   *
   * @overload
   * @returns {Data}
   *
   * @overload
   * @param {Data} dataset
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @overload
   * @param {Key} key
   * @returns {Data[Key]}
   *
   * @overload
   * @param {Key} key
   * @param {Data[Key]} value
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @param {Data | Key} [key]
   *   Key to get or set, or entire dataset to set, or nothing to get the
   *   entire dataset (optional).
   * @param {Data[Key]} [value]
   *   Value to set (optional).
   * @returns {unknown}
   *   The current processor when setting, the value at `key` when getting, or
   *   the entire dataset when getting without key.
   */
  data(t, n) {
    return typeof t == "string" ? arguments.length === 2 ? (kn("data", this.frozen), this.namespace[t] = n, this) : Cf.call(this.namespace, t) && this.namespace[t] || void 0 : t ? (kn("data", this.frozen), this.namespace = t, this) : this.namespace;
  }
  /**
   * Freeze a processor.
   *
   * Frozen processors are meant to be extended and not to be configured
   * directly.
   *
   * When a processor is frozen it cannot be unfrozen.
   * New processors working the same way can be created by calling the
   * processor.
   *
   * It’s possible to freeze processors explicitly by calling `.freeze()`.
   * Processors freeze automatically when `.parse()`, `.run()`, `.runSync()`,
   * `.stringify()`, `.process()`, or `.processSync()` are called.
   *
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *   The current processor.
   */
  freeze() {
    if (this.frozen)
      return this;
    const t = (
      /** @type {Processor} */
      /** @type {unknown} */
      this
    );
    for (; ++this.freezeIndex < this.attachers.length; ) {
      const [n, ...r] = this.attachers[this.freezeIndex];
      if (r[0] === !1)
        continue;
      r[0] === !0 && (r[0] = void 0);
      const i = n.call(t, ...r);
      typeof i == "function" && this.transformers.use(i);
    }
    return this.frozen = !0, this.freezeIndex = Number.POSITIVE_INFINITY, this;
  }
  /**
   * Parse text to a syntax tree.
   *
   * > **Note**: `parse` freezes the processor if not already *frozen*.
   *
   * > **Note**: `parse` performs the parse phase, not the run phase or other
   * > phases.
   *
   * @param {Compatible | undefined} [file]
   *   file to parse (optional); typically `string` or `VFile`; any value
   *   accepted as `x` in `new VFile(x)`.
   * @returns {ParseTree extends undefined ? Node : ParseTree}
   *   Syntax tree representing `file`.
   */
  parse(t) {
    this.freeze();
    const n = Dt(t), r = this.parser || this.Parser;
    return bn("parse", r), r(String(n), n);
  }
  /**
   * Process the given file as configured on the processor.
   *
   * > **Note**: `process` freezes the processor if not already *frozen*.
   *
   * > **Note**: `process` performs the parse, run, and stringify phases.
   *
   * @overload
   * @param {Compatible | undefined} file
   * @param {ProcessCallback<VFileWithOutput<CompileResult>>} done
   * @returns {undefined}
   *
   * @overload
   * @param {Compatible | undefined} [file]
   * @returns {Promise<VFileWithOutput<CompileResult>>}
   *
   * @param {Compatible | undefined} [file]
   *   File (optional); typically `string` or `VFile`]; any value accepted as
   *   `x` in `new VFile(x)`.
   * @param {ProcessCallback<VFileWithOutput<CompileResult>> | undefined} [done]
   *   Callback (optional).
   * @returns {Promise<VFile> | undefined}
   *   Nothing if `done` is given.
   *   Otherwise a promise, rejected with a fatal error or resolved with the
   *   processed file.
   *
   *   The parsed, transformed, and compiled value is available at
   *   `file.value` (see note).
   *
   *   > **Note**: unified typically compiles by serializing: most
   *   > compilers return `string` (or `Uint8Array`).
   *   > Some compilers, such as the one configured with
   *   > [`rehype-react`][rehype-react], return other values (in this case, a
   *   > React tree).
   *   > If you’re using a compiler that doesn’t serialize, expect different
   *   > result values.
   *   >
   *   > To register custom results in TypeScript, add them to
   *   > {@linkcode CompileResultMap}.
   *
   *   [rehype-react]: https://github.com/rehypejs/rehype-react
   */
  process(t, n) {
    const r = this;
    return this.freeze(), bn("process", this.parser || this.Parser), xn("process", this.compiler || this.Compiler), n ? i(void 0, n) : new Promise(i);
    function i(s, o) {
      const a = Dt(t), u = (
        /** @type {HeadTree extends undefined ? Node : HeadTree} */
        /** @type {unknown} */
        r.parse(a)
      );
      r.run(u, a, function(f, c, p) {
        if (f || !c || !p)
          return l(f);
        const h = (
          /** @type {CompileTree extends undefined ? Node : CompileTree} */
          /** @type {unknown} */
          c
        ), d = r.stringify(h, p);
        Tf(d) ? p.value = d : p.result = d, l(
          f,
          /** @type {VFileWithOutput<CompileResult>} */
          p
        );
      });
      function l(f, c) {
        f || !c ? o(f) : s ? s(c) : n(void 0, c);
      }
    }
  }
  /**
   * Process the given file as configured on the processor.
   *
   * An error is thrown if asynchronous transforms are configured.
   *
   * > **Note**: `processSync` freezes the processor if not already *frozen*.
   *
   * > **Note**: `processSync` performs the parse, run, and stringify phases.
   *
   * @param {Compatible | undefined} [file]
   *   File (optional); typically `string` or `VFile`; any value accepted as
   *   `x` in `new VFile(x)`.
   * @returns {VFileWithOutput<CompileResult>}
   *   The processed file.
   *
   *   The parsed, transformed, and compiled value is available at
   *   `file.value` (see note).
   *
   *   > **Note**: unified typically compiles by serializing: most
   *   > compilers return `string` (or `Uint8Array`).
   *   > Some compilers, such as the one configured with
   *   > [`rehype-react`][rehype-react], return other values (in this case, a
   *   > React tree).
   *   > If you’re using a compiler that doesn’t serialize, expect different
   *   > result values.
   *   >
   *   > To register custom results in TypeScript, add them to
   *   > {@linkcode CompileResultMap}.
   *
   *   [rehype-react]: https://github.com/rehypejs/rehype-react
   */
  processSync(t) {
    let n = !1, r;
    return this.freeze(), bn("processSync", this.parser || this.Parser), xn("processSync", this.compiler || this.Compiler), this.process(t, i), bi("processSync", "process", n), r;
    function i(s, o) {
      n = !0, di(s), r = o;
    }
  }
  /**
   * Run *transformers* on a syntax tree.
   *
   * > **Note**: `run` freezes the processor if not already *frozen*.
   *
   * > **Note**: `run` performs the run phase, not other phases.
   *
   * @overload
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   * @param {RunCallback<TailTree extends undefined ? Node : TailTree>} done
   * @returns {undefined}
   *
   * @overload
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   * @param {Compatible | undefined} file
   * @param {RunCallback<TailTree extends undefined ? Node : TailTree>} done
   * @returns {undefined}
   *
   * @overload
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   * @param {Compatible | undefined} [file]
   * @returns {Promise<TailTree extends undefined ? Node : TailTree>}
   *
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   *   Tree to transform and inspect.
   * @param {(
   *   RunCallback<TailTree extends undefined ? Node : TailTree> |
   *   Compatible
   * )} [file]
   *   File associated with `node` (optional); any value accepted as `x` in
   *   `new VFile(x)`.
   * @param {RunCallback<TailTree extends undefined ? Node : TailTree>} [done]
   *   Callback (optional).
   * @returns {Promise<TailTree extends undefined ? Node : TailTree> | undefined}
   *   Nothing if `done` is given.
   *   Otherwise, a promise rejected with a fatal error or resolved with the
   *   transformed tree.
   */
  run(t, n, r) {
    yi(t), this.freeze();
    const i = this.transformers;
    return !r && typeof n == "function" && (r = n, n = void 0), r ? s(void 0, r) : new Promise(s);
    function s(o, a) {
      const u = Dt(n);
      i.run(t, u, l);
      function l(f, c, p) {
        const h = (
          /** @type {TailTree extends undefined ? Node : TailTree} */
          c || t
        );
        f ? a(f) : o ? o(h) : r(void 0, h, p);
      }
    }
  }
  /**
   * Run *transformers* on a syntax tree.
   *
   * An error is thrown if asynchronous transforms are configured.
   *
   * > **Note**: `runSync` freezes the processor if not already *frozen*.
   *
   * > **Note**: `runSync` performs the run phase, not other phases.
   *
   * @param {HeadTree extends undefined ? Node : HeadTree} tree
   *   Tree to transform and inspect.
   * @param {Compatible | undefined} [file]
   *   File associated with `node` (optional); any value accepted as `x` in
   *   `new VFile(x)`.
   * @returns {TailTree extends undefined ? Node : TailTree}
   *   Transformed tree.
   */
  runSync(t, n) {
    let r = !1, i;
    return this.run(t, n, s), bi("runSync", "run", r), i;
    function s(o, a) {
      di(o), i = a, r = !0;
    }
  }
  /**
   * Compile a syntax tree.
   *
   * > **Note**: `stringify` freezes the processor if not already *frozen*.
   *
   * > **Note**: `stringify` performs the stringify phase, not the run phase
   * > or other phases.
   *
   * @param {CompileTree extends undefined ? Node : CompileTree} tree
   *   Tree to compile.
   * @param {Compatible | undefined} [file]
   *   File associated with `node` (optional); any value accepted as `x` in
   *   `new VFile(x)`.
   * @returns {CompileResult extends undefined ? Value : CompileResult}
   *   Textual representation of the tree (see note).
   *
   *   > **Note**: unified typically compiles by serializing: most compilers
   *   > return `string` (or `Uint8Array`).
   *   > Some compilers, such as the one configured with
   *   > [`rehype-react`][rehype-react], return other values (in this case, a
   *   > React tree).
   *   > If you’re using a compiler that doesn’t serialize, expect different
   *   > result values.
   *   >
   *   > To register custom results in TypeScript, add them to
   *   > {@linkcode CompileResultMap}.
   *
   *   [rehype-react]: https://github.com/rehypejs/rehype-react
   */
  stringify(t, n) {
    this.freeze();
    const r = Dt(n), i = this.compiler || this.Compiler;
    return xn("stringify", i), yi(t), i(t, r);
  }
  /**
   * Configure the processor to use a plugin, a list of usable values, or a
   * preset.
   *
   * If the processor is already using a plugin, the previous plugin
   * configuration is changed based on the options that are passed in.
   * In other words, the plugin is not added a second time.
   *
   * > **Note**: `use` cannot be called on *frozen* processors.
   * > Call the processor first to create a new unfrozen processor.
   *
   * @example
   *   There are many ways to pass plugins to `.use()`.
   *   This example gives an overview:
   *
   *   ```js
   *   import {unified} from 'unified'
   *
   *   unified()
   *     // Plugin with options:
   *     .use(pluginA, {x: true, y: true})
   *     // Passing the same plugin again merges configuration (to `{x: true, y: false, z: true}`):
   *     .use(pluginA, {y: false, z: true})
   *     // Plugins:
   *     .use([pluginB, pluginC])
   *     // Two plugins, the second with options:
   *     .use([pluginD, [pluginE, {}]])
   *     // Preset with plugins and settings:
   *     .use({plugins: [pluginF, [pluginG, {}]], settings: {position: false}})
   *     // Settings only:
   *     .use({settings: {position: false}})
   *   ```
   *
   * @template {Array<unknown>} [Parameters=[]]
   * @template {Node | string | undefined} [Input=undefined]
   * @template [Output=Input]
   *
   * @overload
   * @param {Preset | null | undefined} [preset]
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @overload
   * @param {PluggableList} list
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *
   * @overload
   * @param {Plugin<Parameters, Input, Output>} plugin
   * @param {...(Parameters | [boolean])} parameters
   * @returns {UsePlugin<ParseTree, HeadTree, TailTree, CompileTree, CompileResult, Input, Output>}
   *
   * @param {PluggableList | Plugin | Preset | null | undefined} value
   *   Usable value.
   * @param {...unknown} parameters
   *   Parameters, when a plugin is given as a usable value.
   * @returns {Processor<ParseTree, HeadTree, TailTree, CompileTree, CompileResult>}
   *   Current processor.
   */
  use(t, ...n) {
    const r = this.attachers, i = this.namespace;
    if (kn("use", this.frozen), t != null) if (typeof t == "function")
      u(t, n);
    else if (typeof t == "object")
      Array.isArray(t) ? a(t) : o(t);
    else
      throw new TypeError("Expected usable value, not `" + t + "`");
    return this;
    function s(l) {
      if (typeof l == "function")
        u(l, []);
      else if (typeof l == "object")
        if (Array.isArray(l)) {
          const [f, ...c] = (
            /** @type {PluginTuple<Array<unknown>>} */
            l
          );
          u(f, c);
        } else
          o(l);
      else
        throw new TypeError("Expected usable value, not `" + l + "`");
    }
    function o(l) {
      if (!("plugins" in l) && !("settings" in l))
        throw new Error(
          "Expected usable value but received an empty preset, which is probably a mistake: presets typically come with `plugins` and sometimes with `settings`, but this has neither"
        );
      a(l.plugins), l.settings && (i.settings = dn(!0, i.settings, l.settings));
    }
    function a(l) {
      let f = -1;
      if (l != null) if (Array.isArray(l))
        for (; ++f < l.length; ) {
          const c = l[f];
          s(c);
        }
      else
        throw new TypeError("Expected a list of plugins, not `" + l + "`");
    }
    function u(l, f) {
      let c = -1, p = -1;
      for (; ++c < r.length; )
        if (r[c][0] === l) {
          p = c;
          break;
        }
      if (p === -1)
        r.push([l, ...f]);
      else if (f.length > 0) {
        let [h, ...d] = f;
        const y = r[p][1];
        jn(y) && jn(h) && (h = dn(!0, y, h)), r[p] = [l, h, ...d];
      }
    }
  }
}
const Ef = new ir().freeze();
function bn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `parser`");
}
function xn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `compiler`");
}
function kn(e, t) {
  if (t)
    throw new Error(
      "Cannot call `" + e + "` on a frozen processor.\nCreate a new processor first, by calling it: use `processor()` instead of `processor`."
    );
}
function yi(e) {
  if (!jn(e) || typeof e.type != "string")
    throw new TypeError("Expected node, got `" + e + "`");
}
function bi(e, t, n) {
  if (!n)
    throw new Error(
      "`" + e + "` finished async. Use `" + t + "` instead"
    );
}
function Dt(e) {
  return If(e) ? e : new Is(e);
}
function If(e) {
  return !!(e && typeof e == "object" && "message" in e && "messages" in e);
}
function Tf(e) {
  return typeof e == "string" || Lf(e);
}
function Lf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const Nf = "https://github.com/remarkjs/react-markdown/blob/main/changelog.md", xi = [], ki = { allowDangerousHtml: !0 }, Af = /^(https?|ircs?|mailto|xmpp)$/i, Rf = [
  { from: "astPlugins", id: "remove-buggy-html-in-markdown-parser" },
  { from: "allowDangerousHtml", id: "remove-buggy-html-in-markdown-parser" },
  {
    from: "allowNode",
    id: "replace-allownode-allowedtypes-and-disallowedtypes",
    to: "allowElement"
  },
  {
    from: "allowedTypes",
    id: "replace-allownode-allowedtypes-and-disallowedtypes",
    to: "allowedElements"
  },
  { from: "className", id: "remove-classname" },
  {
    from: "disallowedTypes",
    id: "replace-allownode-allowedtypes-and-disallowedtypes",
    to: "disallowedElements"
  },
  { from: "escapeHtml", id: "remove-buggy-html-in-markdown-parser" },
  { from: "includeElementIndex", id: "#remove-includeelementindex" },
  {
    from: "includeNodeIndex",
    id: "change-includenodeindex-to-includeelementindex"
  },
  { from: "linkTarget", id: "remove-linktarget" },
  { from: "plugins", id: "change-plugins-to-remarkplugins", to: "remarkPlugins" },
  { from: "rawSourcePos", id: "#remove-rawsourcepos" },
  { from: "renderers", id: "change-renderers-to-components", to: "components" },
  { from: "source", id: "change-source-to-children", to: "children" },
  { from: "sourcePos", id: "#remove-sourcepos" },
  { from: "transformImageUri", id: "#add-urltransform", to: "urlTransform" },
  { from: "transformLinkUri", id: "#add-urltransform", to: "urlTransform" }
];
function Of(e) {
  const t = Pf(e), n = Df(e);
  return _f(t.runSync(t.parse(n), n), e);
}
function Pf(e) {
  const t = e.rehypePlugins || xi, n = e.remarkPlugins || xi, r = e.remarkRehypeOptions ? { ...e.remarkRehypeOptions, ...ki } : ki;
  return Ef().use(hc).use(n).use(af, r).use(t);
}
function Df(e) {
  const t = e.children || "", n = new Is();
  return typeof t == "string" && (n.value = t), n;
}
function _f(e, t) {
  const n = t.allowedElements, r = t.allowElement, i = t.components, s = t.disallowedElements, o = t.skipHtml, a = t.unwrapDisallowed, u = t.urlTransform || Ff;
  for (const f of Rf)
    Object.hasOwn(t, f.from) && ("" + f.from + (f.to ? "use `" + f.to + "` instead" : "remove it") + Nf + f.id, void 0);
  return rr(e, l), Ja(e, {
    Fragment: ao,
    components: i,
    ignoreInvalidStyle: !0,
    jsx: E,
    jsxs: $,
    passKeys: !0,
    passNode: !0
  });
  function l(f, c, p) {
    if (f.type === "raw" && p && typeof c == "number")
      return o ? p.children.splice(c, 1) : p.children[c] = { type: "text", value: f.value }, c;
    if (f.type === "element") {
      let h;
      for (h in cn)
        if (Object.hasOwn(cn, h) && Object.hasOwn(f.properties, h)) {
          const d = f.properties[h], y = cn[h];
          (y === null || y.includes(f.tagName)) && (f.properties[h] = u(String(d || ""), h, f));
        }
    }
    if (f.type === "element") {
      let h = n ? !n.includes(f.tagName) : s ? s.includes(f.tagName) : !1;
      if (!h && r && typeof c == "number" && (h = !r(f, c, p)), h && p && typeof c == "number")
        return a && f.children ? p.children.splice(c, 1, ...f.children) : p.children.splice(c, 1), c;
    }
  }
}
function Ff(e) {
  const t = e.indexOf(":"), n = e.indexOf("?"), r = e.indexOf("#"), i = e.indexOf("/");
  return (
    // If there is no protocol, it’s relative.
    t === -1 || // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
    i !== -1 && t > i || n !== -1 && t > n || r !== -1 && t > r || // It is a protocol, it should be allowed.
    Af.test(e.slice(0, t)) ? e : ""
  );
}
function wi(e, t) {
  const n = String(e);
  if (typeof t != "string")
    throw new TypeError("Expected character");
  let r = 0, i = n.indexOf(t);
  for (; i !== -1; )
    r++, i = n.indexOf(t, i + t.length);
  return r;
}
function zf(e) {
  if (typeof e != "string")
    throw new TypeError("Expected a string");
  return e.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}
function Mf(e, t, n) {
  const i = Qt((n || {}).ignore || []), s = jf(t);
  let o = -1;
  for (; ++o < s.length; )
    Es(e, "text", a);
  function a(l, f) {
    let c = -1, p;
    for (; ++c < f.length; ) {
      const h = f[c], d = p ? p.children : void 0;
      if (i(
        h,
        d ? d.indexOf(h) : void 0,
        p
      ))
        return;
      p = h;
    }
    if (p)
      return u(l, f);
  }
  function u(l, f) {
    const c = f[f.length - 1], p = s[o][0], h = s[o][1];
    let d = 0;
    const x = c.children.indexOf(l);
    let b = !1, v = [];
    p.lastIndex = 0;
    let w = p.exec(l.value);
    for (; w; ) {
      const I = w.index, O = {
        index: w.index,
        input: w.input,
        stack: [...f, l]
      };
      let S = h(...w, O);
      if (typeof S == "string" && (S = S.length > 0 ? { type: "text", value: S } : void 0), S === !1 ? p.lastIndex = I + 1 : (d !== I && v.push({
        type: "text",
        value: l.value.slice(d, I)
      }), Array.isArray(S) ? v.push(...S) : S && v.push(S), d = I + w[0].length, b = !0), !p.global)
        break;
      w = p.exec(l.value);
    }
    return b ? (d < l.value.length && v.push({ type: "text", value: l.value.slice(d) }), c.children.splice(x, 1, ...v)) : v = [l], x + v.length;
  }
}
function jf(e) {
  const t = [];
  if (!Array.isArray(e))
    throw new TypeError("Expected find and replace tuple or list of tuples");
  const n = !e[0] || Array.isArray(e[0]) ? e : [e];
  let r = -1;
  for (; ++r < n.length; ) {
    const i = n[r];
    t.push([$f(i[0]), Bf(i[1])]);
  }
  return t;
}
function $f(e) {
  return typeof e == "string" ? new RegExp(zf(e), "g") : e;
}
function Bf(e) {
  return typeof e == "function" ? e : function() {
    return e;
  };
}
const wn = "phrasing", Sn = ["autolink", "link", "image", "label"];
function Uf() {
  return {
    transforms: [Jf],
    enter: {
      literalAutolink: Vf,
      literalAutolinkEmail: vn,
      literalAutolinkHttp: vn,
      literalAutolinkWww: vn
    },
    exit: {
      literalAutolink: Gf,
      literalAutolinkEmail: Wf,
      literalAutolinkHttp: qf,
      literalAutolinkWww: Kf
    }
  };
}
function Hf() {
  return {
    unsafe: [
      {
        character: "@",
        before: "[+\\-.\\w]",
        after: "[\\-.\\w]",
        inConstruct: wn,
        notInConstruct: Sn
      },
      {
        character: ".",
        before: "[Ww]",
        after: "[\\-.\\w]",
        inConstruct: wn,
        notInConstruct: Sn
      },
      {
        character: ":",
        before: "[ps]",
        after: "\\/",
        inConstruct: wn,
        notInConstruct: Sn
      }
    ]
  };
}
function Vf(e) {
  this.enter({ type: "link", title: null, url: "", children: [] }, e);
}
function vn(e) {
  this.config.enter.autolinkProtocol.call(this, e);
}
function qf(e) {
  this.config.exit.autolinkProtocol.call(this, e);
}
function Kf(e) {
  this.config.exit.data.call(this, e);
  const t = this.stack[this.stack.length - 1];
  t.type, t.url = "http://" + this.sliceSerialize(e);
}
function Wf(e) {
  this.config.exit.autolinkEmail.call(this, e);
}
function Gf(e) {
  this.exit(e);
}
function Jf(e) {
  Mf(
    e,
    [
      [/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi, Yf],
      [/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu, Qf]
    ],
    { ignore: ["link", "linkReference"] }
  );
}
function Yf(e, t, n, r, i) {
  let s = "";
  if (!Ts(i) || (/^w/i.test(t) && (n = t + n, t = "", s = "http://"), !Xf(n)))
    return !1;
  const o = Zf(n + r);
  if (!o[0]) return !1;
  const a = {
    type: "link",
    title: null,
    url: s + t + o[0],
    children: [{ type: "text", value: t + o[0] }]
  };
  return o[1] ? [a, { type: "text", value: o[1] }] : a;
}
function Qf(e, t, n, r) {
  return (
    // Not an expected previous character.
    !Ts(r, !0) || // Label ends in not allowed character.
    /[-\d_]$/.test(n) ? !1 : {
      type: "link",
      title: null,
      url: "mailto:" + t + "@" + n,
      children: [{ type: "text", value: t + "@" + n }]
    }
  );
}
function Xf(e) {
  const t = e.split(".");
  return !(t.length < 2 || t[t.length - 1] && (/_/.test(t[t.length - 1]) || !/[a-zA-Z\d]/.test(t[t.length - 1])) || t[t.length - 2] && (/_/.test(t[t.length - 2]) || !/[a-zA-Z\d]/.test(t[t.length - 2])));
}
function Zf(e) {
  const t = /[!"&'),.:;<>?\]}]+$/.exec(e);
  if (!t)
    return [e, void 0];
  e = e.slice(0, t.index);
  let n = t[0], r = n.indexOf(")");
  const i = wi(e, "(");
  let s = wi(e, ")");
  for (; r !== -1 && i > s; )
    e += n.slice(0, r + 1), n = n.slice(r + 1), r = n.indexOf(")"), s++;
  return [e, n];
}
function Ts(e, t) {
  const n = e.input.charCodeAt(e.index - 1);
  return (e.index === 0 || We(n) || Gt(n)) && // If it’s an email, the previous character should not be a slash.
  (!t || n !== 47);
}
Ls.peek = lh;
function eh() {
  this.buffer();
}
function th(e) {
  this.enter({ type: "footnoteReference", identifier: "", label: "" }, e);
}
function nh() {
  this.buffer();
}
function rh(e) {
  this.enter(
    { type: "footnoteDefinition", identifier: "", label: "", children: [] },
    e
  );
}
function ih(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = we(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function sh(e) {
  this.exit(e);
}
function oh(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = we(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function ah(e) {
  this.exit(e);
}
function lh() {
  return "[";
}
function Ls(e, t, n, r) {
  const i = n.createTracker(r);
  let s = i.move("[^");
  const o = n.enter("footnoteReference"), a = n.enter("reference");
  return s += i.move(
    n.safe(n.associationId(e), { after: "]", before: s })
  ), a(), o(), s += i.move("]"), s;
}
function uh() {
  return {
    enter: {
      gfmFootnoteCallString: eh,
      gfmFootnoteCall: th,
      gfmFootnoteDefinitionLabelString: nh,
      gfmFootnoteDefinition: rh
    },
    exit: {
      gfmFootnoteCallString: ih,
      gfmFootnoteCall: sh,
      gfmFootnoteDefinitionLabelString: oh,
      gfmFootnoteDefinition: ah
    }
  };
}
function ch(e) {
  let t = !1;
  return e && e.firstLineBlank && (t = !0), {
    handlers: { footnoteDefinition: n, footnoteReference: Ls },
    // This is on by default already.
    unsafe: [{ character: "[", inConstruct: ["label", "phrasing", "reference"] }]
  };
  function n(r, i, s, o) {
    const a = s.createTracker(o);
    let u = a.move("[^");
    const l = s.enter("footnoteDefinition"), f = s.enter("label");
    return u += a.move(
      s.safe(s.associationId(r), { before: u, after: "]" })
    ), f(), u += a.move("]:"), r.children && r.children.length > 0 && (a.shift(4), u += a.move(
      (t ? `
` : " ") + s.indentLines(
        s.containerFlow(r, a.current()),
        t ? Ns : fh
      )
    )), l(), u;
  }
}
function fh(e, t, n) {
  return t === 0 ? e : Ns(e, t, n);
}
function Ns(e, t, n) {
  return (n ? "" : "    ") + e;
}
const hh = [
  "autolink",
  "destinationLiteral",
  "destinationRaw",
  "reference",
  "titleQuote",
  "titleApostrophe"
];
As.peek = yh;
function ph() {
  return {
    canContainEols: ["delete"],
    enter: { strikethrough: gh },
    exit: { strikethrough: mh }
  };
}
function dh() {
  return {
    unsafe: [
      {
        character: "~",
        inConstruct: "phrasing",
        notInConstruct: hh
      }
    ],
    handlers: { delete: As }
  };
}
function gh(e) {
  this.enter({ type: "delete", children: [] }, e);
}
function mh(e) {
  this.exit(e);
}
function As(e, t, n, r) {
  const i = n.createTracker(r), s = n.enter("strikethrough");
  let o = i.move("~~");
  return o += n.containerPhrasing(e, {
    ...i.current(),
    before: o,
    after: "~"
  }), o += i.move("~~"), s(), o;
}
function yh() {
  return "~";
}
function bh(e) {
  return e.length;
}
function xh(e, t) {
  const n = t || {}, r = (n.align || []).concat(), i = n.stringLength || bh, s = [], o = [], a = [], u = [];
  let l = 0, f = -1;
  for (; ++f < e.length; ) {
    const y = [], x = [];
    let b = -1;
    for (e[f].length > l && (l = e[f].length); ++b < e[f].length; ) {
      const v = kh(e[f][b]);
      if (n.alignDelimiters !== !1) {
        const w = i(v);
        x[b] = w, (u[b] === void 0 || w > u[b]) && (u[b] = w);
      }
      y.push(v);
    }
    o[f] = y, a[f] = x;
  }
  let c = -1;
  if (typeof r == "object" && "length" in r)
    for (; ++c < l; )
      s[c] = Si(r[c]);
  else {
    const y = Si(r);
    for (; ++c < l; )
      s[c] = y;
  }
  c = -1;
  const p = [], h = [];
  for (; ++c < l; ) {
    const y = s[c];
    let x = "", b = "";
    y === 99 ? (x = ":", b = ":") : y === 108 ? x = ":" : y === 114 && (b = ":");
    let v = n.alignDelimiters === !1 ? 1 : Math.max(
      1,
      u[c] - x.length - b.length
    );
    const w = x + "-".repeat(v) + b;
    n.alignDelimiters !== !1 && (v = x.length + v + b.length, v > u[c] && (u[c] = v), h[c] = v), p[c] = w;
  }
  o.splice(1, 0, p), a.splice(1, 0, h), f = -1;
  const d = [];
  for (; ++f < o.length; ) {
    const y = o[f], x = a[f];
    c = -1;
    const b = [];
    for (; ++c < l; ) {
      const v = y[c] || "";
      let w = "", I = "";
      if (n.alignDelimiters !== !1) {
        const O = u[c] - (x[c] || 0), S = s[c];
        S === 114 ? w = " ".repeat(O) : S === 99 ? O % 2 ? (w = " ".repeat(O / 2 + 0.5), I = " ".repeat(O / 2 - 0.5)) : (w = " ".repeat(O / 2), I = w) : I = " ".repeat(O);
      }
      n.delimiterStart !== !1 && !c && b.push("|"), n.padding !== !1 && // Don’t add the opening space if we’re not aligning and the cell is
      // empty: there will be a closing space.
      !(n.alignDelimiters === !1 && v === "") && (n.delimiterStart !== !1 || c) && b.push(" "), n.alignDelimiters !== !1 && b.push(w), b.push(v), n.alignDelimiters !== !1 && b.push(I), n.padding !== !1 && b.push(" "), (n.delimiterEnd !== !1 || c !== l - 1) && b.push("|");
    }
    d.push(
      n.delimiterEnd === !1 ? b.join("").replace(/ +$/, "") : b.join("")
    );
  }
  return d.join(`
`);
}
function kh(e) {
  return e == null ? "" : String(e);
}
function Si(e) {
  const t = typeof e == "string" ? e.codePointAt(0) : 0;
  return t === 67 || t === 99 ? 99 : t === 76 || t === 108 ? 108 : t === 82 || t === 114 ? 114 : 0;
}
function wh(e, t, n, r) {
  const i = n.enter("blockquote"), s = n.createTracker(r);
  s.move("> "), s.shift(2);
  const o = n.indentLines(
    n.containerFlow(e, s.current()),
    Sh
  );
  return i(), o;
}
function Sh(e, t, n) {
  return ">" + (n ? "" : " ") + e;
}
function vh(e, t) {
  return vi(e, t.inConstruct, !0) && !vi(e, t.notInConstruct, !1);
}
function vi(e, t, n) {
  if (typeof t == "string" && (t = [t]), !t || t.length === 0)
    return n;
  let r = -1;
  for (; ++r < t.length; )
    if (e.includes(t[r]))
      return !0;
  return !1;
}
function Ci(e, t, n, r) {
  let i = -1;
  for (; ++i < n.unsafe.length; )
    if (n.unsafe[i].character === `
` && vh(n.stack, n.unsafe[i]))
      return /[ \t]/.test(r.before) ? "" : " ";
  return `\\
`;
}
function Ch(e, t) {
  const n = String(e);
  let r = n.indexOf(t), i = r, s = 0, o = 0;
  if (typeof t != "string")
    throw new TypeError("Expected substring");
  for (; r !== -1; )
    r === i ? ++s > o && (o = s) : s = 1, i = r + t.length, r = n.indexOf(t, i);
  return o;
}
function Eh(e, t) {
  return !!(t.options.fences === !1 && e.value && // If there’s no info…
  !e.lang && // And there’s a non-whitespace character…
  /[^ \r\n]/.test(e.value) && // And the value doesn’t start or end in a blank…
  !/^[\t ]*(?:[\r\n]|$)|(?:^|[\r\n])[\t ]*$/.test(e.value));
}
function Ih(e) {
  const t = e.options.fence || "`";
  if (t !== "`" && t !== "~")
    throw new Error(
      "Cannot serialize code with `" + t + "` for `options.fence`, expected `` ` `` or `~`"
    );
  return t;
}
function Th(e, t, n, r) {
  const i = Ih(n), s = e.value || "", o = i === "`" ? "GraveAccent" : "Tilde";
  if (Eh(e, n)) {
    const c = n.enter("codeIndented"), p = n.indentLines(s, Lh);
    return c(), p;
  }
  const a = n.createTracker(r), u = i.repeat(Math.max(Ch(s, i) + 1, 3)), l = n.enter("codeFenced");
  let f = a.move(u);
  if (e.lang) {
    const c = n.enter(`codeFencedLang${o}`);
    f += a.move(
      n.safe(e.lang, {
        before: f,
        after: " ",
        encode: ["`"],
        ...a.current()
      })
    ), c();
  }
  if (e.lang && e.meta) {
    const c = n.enter(`codeFencedMeta${o}`);
    f += a.move(" "), f += a.move(
      n.safe(e.meta, {
        before: f,
        after: `
`,
        encode: ["`"],
        ...a.current()
      })
    ), c();
  }
  return f += a.move(`
`), s && (f += a.move(s + `
`)), f += a.move(u), l(), f;
}
function Lh(e, t, n) {
  return (n ? "" : "    ") + e;
}
function sr(e) {
  const t = e.options.quote || '"';
  if (t !== '"' && t !== "'")
    throw new Error(
      "Cannot serialize title with `" + t + "` for `options.quote`, expected `\"`, or `'`"
    );
  return t;
}
function Nh(e, t, n, r) {
  const i = sr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.enter("definition");
  let a = n.enter("label");
  const u = n.createTracker(r);
  let l = u.move("[");
  return l += u.move(
    n.safe(n.associationId(e), {
      before: l,
      after: "]",
      ...u.current()
    })
  ), l += u.move("]: "), a(), // If there’s no url, or…
  !e.url || // If there are control characters or whitespace.
  /[\0- \u007F]/.test(e.url) ? (a = n.enter("destinationLiteral"), l += u.move("<"), l += u.move(
    n.safe(e.url, { before: l, after: ">", ...u.current() })
  ), l += u.move(">")) : (a = n.enter("destinationRaw"), l += u.move(
    n.safe(e.url, {
      before: l,
      after: e.title ? " " : `
`,
      ...u.current()
    })
  )), a(), e.title && (a = n.enter(`title${s}`), l += u.move(" " + i), l += u.move(
    n.safe(e.title, {
      before: l,
      after: i,
      ...u.current()
    })
  ), l += u.move(i), a()), o(), l;
}
function Ah(e) {
  const t = e.options.emphasis || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize emphasis with `" + t + "` for `options.emphasis`, expected `*`, or `_`"
    );
  return t;
}
function Ct(e) {
  return "&#x" + e.toString(16).toUpperCase() + ";";
}
function Kt(e, t, n) {
  const r = nt(e), i = nt(t);
  return r === void 0 ? i === void 0 ? (
    // Letter inside:
    // we have to encode *both* letters for `_` as it is looser.
    // it already forms for `*` (and GFMs `~`).
    n === "_" ? { inside: !0, outside: !0 } : { inside: !1, outside: !1 }
  ) : i === 1 ? (
    // Whitespace inside: encode both (letter, whitespace).
    { inside: !0, outside: !0 }
  ) : (
    // Punctuation inside: encode outer (letter)
    { inside: !1, outside: !0 }
  ) : r === 1 ? i === void 0 ? (
    // Letter inside: already forms.
    { inside: !1, outside: !1 }
  ) : i === 1 ? (
    // Whitespace inside: encode both (whitespace).
    { inside: !0, outside: !0 }
  ) : (
    // Punctuation inside: already forms.
    { inside: !1, outside: !1 }
  ) : i === void 0 ? (
    // Letter inside: already forms.
    { inside: !1, outside: !1 }
  ) : i === 1 ? (
    // Whitespace inside: encode inner (whitespace).
    { inside: !0, outside: !1 }
  ) : (
    // Punctuation inside: already forms.
    { inside: !1, outside: !1 }
  );
}
Rs.peek = Rh;
function Rs(e, t, n, r) {
  const i = Ah(n), s = n.enter("emphasis"), o = n.createTracker(r), a = o.move(i);
  let u = o.move(
    n.containerPhrasing(e, {
      after: i,
      before: a,
      ...o.current()
    })
  );
  const l = u.charCodeAt(0), f = Kt(
    r.before.charCodeAt(r.before.length - 1),
    l,
    i
  );
  f.inside && (u = Ct(l) + u.slice(1));
  const c = u.charCodeAt(u.length - 1), p = Kt(r.after.charCodeAt(0), c, i);
  p.inside && (u = u.slice(0, -1) + Ct(c));
  const h = o.move(i);
  return s(), n.attentionEncodeSurroundingInfo = {
    after: p.outside,
    before: f.outside
  }, a + u + h;
}
function Rh(e, t, n) {
  return n.options.emphasis || "*";
}
function Oh(e, t) {
  let n = !1;
  return rr(e, function(r) {
    if ("value" in r && /\r?\n|\r/.test(r.value) || r.type === "break")
      return n = !0, zn;
  }), !!((!e.depth || e.depth < 3) && Yn(e) && (t.options.setext || n));
}
function Ph(e, t, n, r) {
  const i = Math.max(Math.min(6, e.depth || 1), 1), s = n.createTracker(r);
  if (Oh(e, n)) {
    const f = n.enter("headingSetext"), c = n.enter("phrasing"), p = n.containerPhrasing(e, {
      ...s.current(),
      before: `
`,
      after: `
`
    });
    return c(), f(), p + `
` + (i === 1 ? "=" : "-").repeat(
      // The whole size…
      p.length - // Minus the position of the character after the last EOL (or
      // 0 if there is none)…
      (Math.max(p.lastIndexOf("\r"), p.lastIndexOf(`
`)) + 1)
    );
  }
  const o = "#".repeat(i), a = n.enter("headingAtx"), u = n.enter("phrasing");
  s.move(o + " ");
  let l = n.containerPhrasing(e, {
    before: "# ",
    after: `
`,
    ...s.current()
  });
  return /^[\t ]/.test(l) && (l = Ct(l.charCodeAt(0)) + l.slice(1)), l = l ? o + " " + l : o, n.options.closeAtx && (l += " " + o), u(), a(), l;
}
Os.peek = Dh;
function Os(e) {
  return e.value || "";
}
function Dh() {
  return "<";
}
Ps.peek = _h;
function Ps(e, t, n, r) {
  const i = sr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.enter("image");
  let a = n.enter("label");
  const u = n.createTracker(r);
  let l = u.move("![");
  return l += u.move(
    n.safe(e.alt, { before: l, after: "]", ...u.current() })
  ), l += u.move("]("), a(), // If there’s no url but there is a title…
  !e.url && e.title || // If there are control characters or whitespace.
  /[\0- \u007F]/.test(e.url) ? (a = n.enter("destinationLiteral"), l += u.move("<"), l += u.move(
    n.safe(e.url, { before: l, after: ">", ...u.current() })
  ), l += u.move(">")) : (a = n.enter("destinationRaw"), l += u.move(
    n.safe(e.url, {
      before: l,
      after: e.title ? " " : ")",
      ...u.current()
    })
  )), a(), e.title && (a = n.enter(`title${s}`), l += u.move(" " + i), l += u.move(
    n.safe(e.title, {
      before: l,
      after: i,
      ...u.current()
    })
  ), l += u.move(i), a()), l += u.move(")"), o(), l;
}
function _h() {
  return "!";
}
Ds.peek = Fh;
function Ds(e, t, n, r) {
  const i = e.referenceType, s = n.enter("imageReference");
  let o = n.enter("label");
  const a = n.createTracker(r);
  let u = a.move("![");
  const l = n.safe(e.alt, {
    before: u,
    after: "]",
    ...a.current()
  });
  u += a.move(l + "]["), o();
  const f = n.stack;
  n.stack = [], o = n.enter("reference");
  const c = n.safe(n.associationId(e), {
    before: u,
    after: "]",
    ...a.current()
  });
  return o(), n.stack = f, s(), i === "full" || !l || l !== c ? u += a.move(c + "]") : i === "shortcut" ? u = u.slice(0, -1) : u += a.move("]"), u;
}
function Fh() {
  return "!";
}
_s.peek = zh;
function _s(e, t, n) {
  let r = e.value || "", i = "`", s = -1;
  for (; new RegExp("(^|[^`])" + i + "([^`]|$)").test(r); )
    i += "`";
  for (/[^ \r\n]/.test(r) && (/^[ \r\n]/.test(r) && /[ \r\n]$/.test(r) || /^`|`$/.test(r)) && (r = " " + r + " "); ++s < n.unsafe.length; ) {
    const o = n.unsafe[s], a = n.compilePattern(o);
    let u;
    if (o.atBreak)
      for (; u = a.exec(r); ) {
        let l = u.index;
        r.charCodeAt(l) === 10 && r.charCodeAt(l - 1) === 13 && l--, r = r.slice(0, l) + " " + r.slice(u.index + 1);
      }
  }
  return i + r + i;
}
function zh() {
  return "`";
}
function Fs(e, t) {
  const n = Yn(e);
  return !!(!t.options.resourceLink && // If there’s a url…
  e.url && // And there’s a no title…
  !e.title && // And the content of `node` is a single text node…
  e.children && e.children.length === 1 && e.children[0].type === "text" && // And if the url is the same as the content…
  (n === e.url || "mailto:" + n === e.url) && // And that starts w/ a protocol…
  /^[a-z][a-z+.-]+:/i.test(e.url) && // And that doesn’t contain ASCII control codes (character escapes and
  // references don’t work), space, or angle brackets…
  !/[\0- <>\u007F]/.test(e.url));
}
zs.peek = Mh;
function zs(e, t, n, r) {
  const i = sr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.createTracker(r);
  let a, u;
  if (Fs(e, n)) {
    const f = n.stack;
    n.stack = [], a = n.enter("autolink");
    let c = o.move("<");
    return c += o.move(
      n.containerPhrasing(e, {
        before: c,
        after: ">",
        ...o.current()
      })
    ), c += o.move(">"), a(), n.stack = f, c;
  }
  a = n.enter("link"), u = n.enter("label");
  let l = o.move("[");
  return l += o.move(
    n.containerPhrasing(e, {
      before: l,
      after: "](",
      ...o.current()
    })
  ), l += o.move("]("), u(), // If there’s no url but there is a title…
  !e.url && e.title || // If there are control characters or whitespace.
  /[\0- \u007F]/.test(e.url) ? (u = n.enter("destinationLiteral"), l += o.move("<"), l += o.move(
    n.safe(e.url, { before: l, after: ">", ...o.current() })
  ), l += o.move(">")) : (u = n.enter("destinationRaw"), l += o.move(
    n.safe(e.url, {
      before: l,
      after: e.title ? " " : ")",
      ...o.current()
    })
  )), u(), e.title && (u = n.enter(`title${s}`), l += o.move(" " + i), l += o.move(
    n.safe(e.title, {
      before: l,
      after: i,
      ...o.current()
    })
  ), l += o.move(i), u()), l += o.move(")"), a(), l;
}
function Mh(e, t, n) {
  return Fs(e, n) ? "<" : "[";
}
Ms.peek = jh;
function Ms(e, t, n, r) {
  const i = e.referenceType, s = n.enter("linkReference");
  let o = n.enter("label");
  const a = n.createTracker(r);
  let u = a.move("[");
  const l = n.containerPhrasing(e, {
    before: u,
    after: "]",
    ...a.current()
  });
  u += a.move(l + "]["), o();
  const f = n.stack;
  n.stack = [], o = n.enter("reference");
  const c = n.safe(n.associationId(e), {
    before: u,
    after: "]",
    ...a.current()
  });
  return o(), n.stack = f, s(), i === "full" || !l || l !== c ? u += a.move(c + "]") : i === "shortcut" ? u = u.slice(0, -1) : u += a.move("]"), u;
}
function jh() {
  return "[";
}
function or(e) {
  const t = e.options.bullet || "*";
  if (t !== "*" && t !== "+" && t !== "-")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bullet`, expected `*`, `+`, or `-`"
    );
  return t;
}
function $h(e) {
  const t = or(e), n = e.options.bulletOther;
  if (!n)
    return t === "*" ? "-" : "*";
  if (n !== "*" && n !== "+" && n !== "-")
    throw new Error(
      "Cannot serialize items with `" + n + "` for `options.bulletOther`, expected `*`, `+`, or `-`"
    );
  if (n === t)
    throw new Error(
      "Expected `bullet` (`" + t + "`) and `bulletOther` (`" + n + "`) to be different"
    );
  return n;
}
function Bh(e) {
  const t = e.options.bulletOrdered || ".";
  if (t !== "." && t !== ")")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bulletOrdered`, expected `.` or `)`"
    );
  return t;
}
function js(e) {
  const t = e.options.rule || "*";
  if (t !== "*" && t !== "-" && t !== "_")
    throw new Error(
      "Cannot serialize rules with `" + t + "` for `options.rule`, expected `*`, `-`, or `_`"
    );
  return t;
}
function Uh(e, t, n, r) {
  const i = n.enter("list"), s = n.bulletCurrent;
  let o = e.ordered ? Bh(n) : or(n);
  const a = e.ordered ? o === "." ? ")" : "." : $h(n);
  let u = t && n.bulletLastUsed ? o === n.bulletLastUsed : !1;
  if (!e.ordered) {
    const f = e.children ? e.children[0] : void 0;
    if (
      // Bullet could be used as a thematic break marker:
      (o === "*" || o === "-") && // Empty first list item:
      f && (!f.children || !f.children[0]) && // Directly in two other list items:
      n.stack[n.stack.length - 1] === "list" && n.stack[n.stack.length - 2] === "listItem" && n.stack[n.stack.length - 3] === "list" && n.stack[n.stack.length - 4] === "listItem" && // That are each the first child.
      n.indexStack[n.indexStack.length - 1] === 0 && n.indexStack[n.indexStack.length - 2] === 0 && n.indexStack[n.indexStack.length - 3] === 0 && (u = !0), js(n) === o && f
    ) {
      let c = -1;
      for (; ++c < e.children.length; ) {
        const p = e.children[c];
        if (p && p.type === "listItem" && p.children && p.children[0] && p.children[0].type === "thematicBreak") {
          u = !0;
          break;
        }
      }
    }
  }
  u && (o = a), n.bulletCurrent = o;
  const l = n.containerFlow(e, r);
  return n.bulletLastUsed = o, n.bulletCurrent = s, i(), l;
}
function Hh(e) {
  const t = e.options.listItemIndent || "one";
  if (t !== "tab" && t !== "one" && t !== "mixed")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.listItemIndent`, expected `tab`, `one`, or `mixed`"
    );
  return t;
}
function Vh(e, t, n, r) {
  const i = Hh(n);
  let s = n.bulletCurrent || or(n);
  t && t.type === "list" && t.ordered && (s = (typeof t.start == "number" && t.start > -1 ? t.start : 1) + (n.options.incrementListMarker === !1 ? 0 : t.children.indexOf(e)) + s);
  let o = s.length + 1;
  (i === "tab" || i === "mixed" && (t && t.type === "list" && t.spread || e.spread)) && (o = Math.ceil(o / 4) * 4);
  const a = n.createTracker(r);
  a.move(s + " ".repeat(o - s.length)), a.shift(o);
  const u = n.enter("listItem"), l = n.indentLines(
    n.containerFlow(e, a.current()),
    f
  );
  return u(), l;
  function f(c, p, h) {
    return p ? (h ? "" : " ".repeat(o)) + c : (h ? s : s + " ".repeat(o - s.length)) + c;
  }
}
function qh(e, t, n, r) {
  const i = n.enter("paragraph"), s = n.enter("phrasing"), o = n.containerPhrasing(e, r);
  return s(), i(), o;
}
const Kh = (
  /** @type {(node?: unknown) => node is Exclude<PhrasingContent, Html>} */
  Qt([
    "break",
    "delete",
    "emphasis",
    // To do: next major: removed since footnotes were added to GFM.
    "footnote",
    "footnoteReference",
    "image",
    "imageReference",
    "inlineCode",
    // Enabled by `mdast-util-math`:
    "inlineMath",
    "link",
    "linkReference",
    // Enabled by `mdast-util-mdx`:
    "mdxJsxTextElement",
    // Enabled by `mdast-util-mdx`:
    "mdxTextExpression",
    "strong",
    "text",
    // Enabled by `mdast-util-directive`:
    "textDirective"
  ])
);
function Wh(e, t, n, r) {
  return (e.children.some(function(o) {
    return Kh(o);
  }) ? n.containerPhrasing : n.containerFlow).call(n, e, r);
}
function Gh(e) {
  const t = e.options.strong || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize strong with `" + t + "` for `options.strong`, expected `*`, or `_`"
    );
  return t;
}
$s.peek = Jh;
function $s(e, t, n, r) {
  const i = Gh(n), s = n.enter("strong"), o = n.createTracker(r), a = o.move(i + i);
  let u = o.move(
    n.containerPhrasing(e, {
      after: i,
      before: a,
      ...o.current()
    })
  );
  const l = u.charCodeAt(0), f = Kt(
    r.before.charCodeAt(r.before.length - 1),
    l,
    i
  );
  f.inside && (u = Ct(l) + u.slice(1));
  const c = u.charCodeAt(u.length - 1), p = Kt(r.after.charCodeAt(0), c, i);
  p.inside && (u = u.slice(0, -1) + Ct(c));
  const h = o.move(i + i);
  return s(), n.attentionEncodeSurroundingInfo = {
    after: p.outside,
    before: f.outside
  }, a + u + h;
}
function Jh(e, t, n) {
  return n.options.strong || "*";
}
function Yh(e, t, n, r) {
  return n.safe(e.value, r);
}
function Qh(e) {
  const t = e.options.ruleRepetition || 3;
  if (t < 3)
    throw new Error(
      "Cannot serialize rules with repetition `" + t + "` for `options.ruleRepetition`, expected `3` or more"
    );
  return t;
}
function Xh(e, t, n) {
  const r = (js(n) + (n.options.ruleSpaces ? " " : "")).repeat(Qh(n));
  return n.options.ruleSpaces ? r.slice(0, -1) : r;
}
const Bs = {
  blockquote: wh,
  break: Ci,
  code: Th,
  definition: Nh,
  emphasis: Rs,
  hardBreak: Ci,
  heading: Ph,
  html: Os,
  image: Ps,
  imageReference: Ds,
  inlineCode: _s,
  link: zs,
  linkReference: Ms,
  list: Uh,
  listItem: Vh,
  paragraph: qh,
  root: Wh,
  strong: $s,
  text: Yh,
  thematicBreak: Xh
};
function Zh() {
  return {
    enter: {
      table: ep,
      tableData: Ei,
      tableHeader: Ei,
      tableRow: np
    },
    exit: {
      codeText: rp,
      table: tp,
      tableData: Cn,
      tableHeader: Cn,
      tableRow: Cn
    }
  };
}
function ep(e) {
  const t = e._align;
  this.enter(
    {
      type: "table",
      align: t.map(function(n) {
        return n === "none" ? null : n;
      }),
      children: []
    },
    e
  ), this.data.inTable = !0;
}
function tp(e) {
  this.exit(e), this.data.inTable = void 0;
}
function np(e) {
  this.enter({ type: "tableRow", children: [] }, e);
}
function Cn(e) {
  this.exit(e);
}
function Ei(e) {
  this.enter({ type: "tableCell", children: [] }, e);
}
function rp(e) {
  let t = this.resume();
  this.data.inTable && (t = t.replace(/\\([\\|])/g, ip));
  const n = this.stack[this.stack.length - 1];
  n.type, n.value = t, this.exit(e);
}
function ip(e, t) {
  return t === "|" ? t : e;
}
function sp(e) {
  const t = e || {}, n = t.tableCellPadding, r = t.tablePipeAlign, i = t.stringLength, s = n ? " " : "|";
  return {
    unsafe: [
      { character: "\r", inConstruct: "tableCell" },
      { character: `
`, inConstruct: "tableCell" },
      // A pipe, when followed by a tab or space (padding), or a dash or colon
      // (unpadded delimiter row), could result in a table.
      { atBreak: !0, character: "|", after: "[	 :-]" },
      // A pipe in a cell must be encoded.
      { character: "|", inConstruct: "tableCell" },
      // A colon must be followed by a dash, in which case it could start a
      // delimiter row.
      { atBreak: !0, character: ":", after: "-" },
      // A delimiter row can also start with a dash, when followed by more
      // dashes, a colon, or a pipe.
      // This is a stricter version than the built in check for lists, thematic
      // breaks, and setex heading underlines though:
      // <https://github.com/syntax-tree/mdast-util-to-markdown/blob/51a2038/lib/unsafe.js#L57>
      { atBreak: !0, character: "-", after: "[:|-]" }
    ],
    handlers: {
      inlineCode: p,
      table: o,
      tableCell: u,
      tableRow: a
    }
  };
  function o(h, d, y, x) {
    return l(f(h, y, x), h.align);
  }
  function a(h, d, y, x) {
    const b = c(h, y, x), v = l([b]);
    return v.slice(0, v.indexOf(`
`));
  }
  function u(h, d, y, x) {
    const b = y.enter("tableCell"), v = y.enter("phrasing"), w = y.containerPhrasing(h, {
      ...x,
      before: s,
      after: s
    });
    return v(), b(), w;
  }
  function l(h, d) {
    return xh(h, {
      align: d,
      // @ts-expect-error: `markdown-table` types should support `null`.
      alignDelimiters: r,
      // @ts-expect-error: `markdown-table` types should support `null`.
      padding: n,
      // @ts-expect-error: `markdown-table` types should support `null`.
      stringLength: i
    });
  }
  function f(h, d, y) {
    const x = h.children;
    let b = -1;
    const v = [], w = d.enter("table");
    for (; ++b < x.length; )
      v[b] = c(x[b], d, y);
    return w(), v;
  }
  function c(h, d, y) {
    const x = h.children;
    let b = -1;
    const v = [], w = d.enter("tableRow");
    for (; ++b < x.length; )
      v[b] = u(x[b], h, d, y);
    return w(), v;
  }
  function p(h, d, y) {
    let x = Bs.inlineCode(h, d, y);
    return y.stack.includes("tableCell") && (x = x.replace(/\|/g, "\\$&")), x;
  }
}
function op() {
  return {
    exit: {
      taskListCheckValueChecked: Ii,
      taskListCheckValueUnchecked: Ii,
      paragraph: lp
    }
  };
}
function ap() {
  return {
    unsafe: [{ atBreak: !0, character: "-", after: "[:|-]" }],
    handlers: { listItem: up }
  };
}
function Ii(e) {
  const t = this.stack[this.stack.length - 2];
  t.type, t.checked = e.type === "taskListCheckValueChecked";
}
function lp(e) {
  const t = this.stack[this.stack.length - 2];
  if (t && t.type === "listItem" && typeof t.checked == "boolean") {
    const n = this.stack[this.stack.length - 1];
    n.type;
    const r = n.children[0];
    if (r && r.type === "text") {
      const i = t.children;
      let s = -1, o;
      for (; ++s < i.length; ) {
        const a = i[s];
        if (a.type === "paragraph") {
          o = a;
          break;
        }
      }
      o === n && (r.value = r.value.slice(1), r.value.length === 0 ? n.children.shift() : n.position && r.position && typeof r.position.start.offset == "number" && (r.position.start.column++, r.position.start.offset++, n.position.start = Object.assign({}, r.position.start)));
    }
  }
  this.exit(e);
}
function up(e, t, n, r) {
  const i = e.children[0], s = typeof e.checked == "boolean" && i && i.type === "paragraph", o = "[" + (e.checked ? "x" : " ") + "] ", a = n.createTracker(r);
  s && a.move(o);
  let u = Bs.listItem(e, t, n, {
    ...r,
    ...a.current()
  });
  return s && (u = u.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/, l)), u;
  function l(f) {
    return f + o;
  }
}
function cp() {
  return [
    Uf(),
    uh(),
    ph(),
    Zh(),
    op()
  ];
}
function fp(e) {
  return {
    extensions: [
      Hf(),
      ch(e),
      dh(),
      sp(e),
      ap()
    ]
  };
}
const hp = {
  tokenize: bp,
  partial: !0
}, Us = {
  tokenize: xp,
  partial: !0
}, Hs = {
  tokenize: kp,
  partial: !0
}, Vs = {
  tokenize: wp,
  partial: !0
}, pp = {
  tokenize: Sp,
  partial: !0
}, qs = {
  name: "wwwAutolink",
  tokenize: mp,
  previous: Ws
}, Ks = {
  name: "protocolAutolink",
  tokenize: yp,
  previous: Gs
}, Ne = {
  name: "emailAutolink",
  tokenize: gp,
  previous: Js
}, Ee = {};
function dp() {
  return {
    text: Ee
  };
}
let je = 48;
for (; je < 123; )
  Ee[je] = Ne, je++, je === 58 ? je = 65 : je === 91 && (je = 97);
Ee[43] = Ne;
Ee[45] = Ne;
Ee[46] = Ne;
Ee[95] = Ne;
Ee[72] = [Ne, Ks];
Ee[104] = [Ne, Ks];
Ee[87] = [Ne, qs];
Ee[119] = [Ne, qs];
function gp(e, t, n) {
  const r = this;
  let i, s;
  return o;
  function o(c) {
    return !Bn(c) || !Js.call(r, r.previous) || ar(r.events) ? n(c) : (e.enter("literalAutolink"), e.enter("literalAutolinkEmail"), a(c));
  }
  function a(c) {
    return Bn(c) ? (e.consume(c), a) : c === 64 ? (e.consume(c), u) : n(c);
  }
  function u(c) {
    return c === 46 ? e.check(pp, f, l)(c) : c === 45 || c === 95 || ie(c) ? (s = !0, e.consume(c), u) : f(c);
  }
  function l(c) {
    return e.consume(c), i = !0, u;
  }
  function f(c) {
    return s && i && oe(r.previous) ? (e.exit("literalAutolinkEmail"), e.exit("literalAutolink"), t(c)) : n(c);
  }
}
function mp(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return o !== 87 && o !== 119 || !Ws.call(r, r.previous) || ar(r.events) ? n(o) : (e.enter("literalAutolink"), e.enter("literalAutolinkWww"), e.check(hp, e.attempt(Us, e.attempt(Hs, s), n), n)(o));
  }
  function s(o) {
    return e.exit("literalAutolinkWww"), e.exit("literalAutolink"), t(o);
  }
}
function yp(e, t, n) {
  const r = this;
  let i = "", s = !1;
  return o;
  function o(c) {
    return (c === 72 || c === 104) && Gs.call(r, r.previous) && !ar(r.events) ? (e.enter("literalAutolink"), e.enter("literalAutolinkHttp"), i += String.fromCodePoint(c), e.consume(c), a) : n(c);
  }
  function a(c) {
    if (oe(c) && i.length < 5)
      return i += String.fromCodePoint(c), e.consume(c), a;
    if (c === 58) {
      const p = i.toLowerCase();
      if (p === "http" || p === "https")
        return e.consume(c), u;
    }
    return n(c);
  }
  function u(c) {
    return c === 47 ? (e.consume(c), s ? l : (s = !0, u)) : n(c);
  }
  function l(c) {
    return c === null || Ht(c) || Y(c) || We(c) || Gt(c) ? n(c) : e.attempt(Us, e.attempt(Hs, f), n)(c);
  }
  function f(c) {
    return e.exit("literalAutolinkHttp"), e.exit("literalAutolink"), t(c);
  }
}
function bp(e, t, n) {
  let r = 0;
  return i;
  function i(o) {
    return (o === 87 || o === 119) && r < 3 ? (r++, e.consume(o), i) : o === 46 && r === 3 ? (e.consume(o), s) : n(o);
  }
  function s(o) {
    return o === null ? n(o) : t(o);
  }
}
function xp(e, t, n) {
  let r, i, s;
  return o;
  function o(l) {
    return l === 46 || l === 95 ? e.check(Vs, u, a)(l) : l === null || Y(l) || We(l) || l !== 45 && Gt(l) ? u(l) : (s = !0, e.consume(l), o);
  }
  function a(l) {
    return l === 95 ? r = !0 : (i = r, r = void 0), e.consume(l), o;
  }
  function u(l) {
    return i || r || !s ? n(l) : t(l);
  }
}
function kp(e, t) {
  let n = 0, r = 0;
  return i;
  function i(o) {
    return o === 40 ? (n++, e.consume(o), i) : o === 41 && r < n ? s(o) : o === 33 || o === 34 || o === 38 || o === 39 || o === 41 || o === 42 || o === 44 || o === 46 || o === 58 || o === 59 || o === 60 || o === 63 || o === 93 || o === 95 || o === 126 ? e.check(Vs, t, s)(o) : o === null || Y(o) || We(o) ? t(o) : (e.consume(o), i);
  }
  function s(o) {
    return o === 41 && r++, e.consume(o), i;
  }
}
function wp(e, t, n) {
  return r;
  function r(a) {
    return a === 33 || a === 34 || a === 39 || a === 41 || a === 42 || a === 44 || a === 46 || a === 58 || a === 59 || a === 63 || a === 95 || a === 126 ? (e.consume(a), r) : a === 38 ? (e.consume(a), s) : a === 93 ? (e.consume(a), i) : (
      // `<` is an end.
      a === 60 || // So is whitespace.
      a === null || Y(a) || We(a) ? t(a) : n(a)
    );
  }
  function i(a) {
    return a === null || a === 40 || a === 91 || Y(a) || We(a) ? t(a) : r(a);
  }
  function s(a) {
    return oe(a) ? o(a) : n(a);
  }
  function o(a) {
    return a === 59 ? (e.consume(a), r) : oe(a) ? (e.consume(a), o) : n(a);
  }
}
function Sp(e, t, n) {
  return r;
  function r(s) {
    return e.consume(s), i;
  }
  function i(s) {
    return ie(s) ? n(s) : t(s);
  }
}
function Ws(e) {
  return e === null || e === 40 || e === 42 || e === 95 || e === 91 || e === 93 || e === 126 || Y(e);
}
function Gs(e) {
  return !oe(e);
}
function Js(e) {
  return !(e === 47 || Bn(e));
}
function Bn(e) {
  return e === 43 || e === 45 || e === 46 || e === 95 || ie(e);
}
function ar(e) {
  let t = e.length, n = !1;
  for (; t--; ) {
    const r = e[t][1];
    if ((r.type === "labelLink" || r.type === "labelImage") && !r._balanced) {
      n = !0;
      break;
    }
    if (r._gfmAutolinkLiteralWalkedInto) {
      n = !1;
      break;
    }
  }
  return e.length > 0 && !n && (e[e.length - 1][1]._gfmAutolinkLiteralWalkedInto = !0), n;
}
const vp = {
  tokenize: Rp,
  partial: !0
};
function Cp() {
  return {
    document: {
      91: {
        name: "gfmFootnoteDefinition",
        tokenize: Lp,
        continuation: {
          tokenize: Np
        },
        exit: Ap
      }
    },
    text: {
      91: {
        name: "gfmFootnoteCall",
        tokenize: Tp
      },
      93: {
        name: "gfmPotentialFootnoteCall",
        add: "after",
        tokenize: Ep,
        resolveTo: Ip
      }
    }
  };
}
function Ep(e, t, n) {
  const r = this;
  let i = r.events.length;
  const s = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let o;
  for (; i--; ) {
    const u = r.events[i][1];
    if (u.type === "labelImage") {
      o = u;
      break;
    }
    if (u.type === "gfmFootnoteCall" || u.type === "labelLink" || u.type === "label" || u.type === "image" || u.type === "link")
      break;
  }
  return a;
  function a(u) {
    if (!o || !o._balanced)
      return n(u);
    const l = we(r.sliceSerialize({
      start: o.end,
      end: r.now()
    }));
    return l.codePointAt(0) !== 94 || !s.includes(l.slice(1)) ? n(u) : (e.enter("gfmFootnoteCallLabelMarker"), e.consume(u), e.exit("gfmFootnoteCallLabelMarker"), t(u));
  }
}
function Ip(e, t) {
  let n = e.length;
  for (; n--; )
    if (e[n][1].type === "labelImage" && e[n][0] === "enter") {
      e[n][1];
      break;
    }
  e[n + 1][1].type = "data", e[n + 3][1].type = "gfmFootnoteCallLabelMarker";
  const r = {
    type: "gfmFootnoteCall",
    start: Object.assign({}, e[n + 3][1].start),
    end: Object.assign({}, e[e.length - 1][1].end)
  }, i = {
    type: "gfmFootnoteCallMarker",
    start: Object.assign({}, e[n + 3][1].end),
    end: Object.assign({}, e[n + 3][1].end)
  };
  i.end.column++, i.end.offset++, i.end._bufferIndex++;
  const s = {
    type: "gfmFootnoteCallString",
    start: Object.assign({}, i.end),
    end: Object.assign({}, e[e.length - 1][1].start)
  }, o = {
    type: "chunkString",
    contentType: "string",
    start: Object.assign({}, s.start),
    end: Object.assign({}, s.end)
  }, a = [
    // Take the `labelImageMarker` (now `data`, the `!`)
    e[n + 1],
    e[n + 2],
    ["enter", r, t],
    // The `[`
    e[n + 3],
    e[n + 4],
    // The `^`.
    ["enter", i, t],
    ["exit", i, t],
    // Everything in between.
    ["enter", s, t],
    ["enter", o, t],
    ["exit", o, t],
    ["exit", s, t],
    // The ending (`]`, properly parsed and labelled).
    e[e.length - 2],
    e[e.length - 1],
    ["exit", r, t]
  ];
  return e.splice(n, e.length - n + 1, ...a), e;
}
function Tp(e, t, n) {
  const r = this, i = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let s = 0, o;
  return a;
  function a(c) {
    return e.enter("gfmFootnoteCall"), e.enter("gfmFootnoteCallLabelMarker"), e.consume(c), e.exit("gfmFootnoteCallLabelMarker"), u;
  }
  function u(c) {
    return c !== 94 ? n(c) : (e.enter("gfmFootnoteCallMarker"), e.consume(c), e.exit("gfmFootnoteCallMarker"), e.enter("gfmFootnoteCallString"), e.enter("chunkString").contentType = "string", l);
  }
  function l(c) {
    if (
      // Too long.
      s > 999 || // Closing brace with nothing.
      c === 93 && !o || // Space or tab is not supported by GFM for some reason.
      // `\n` and `[` not being supported makes sense.
      c === null || c === 91 || Y(c)
    )
      return n(c);
    if (c === 93) {
      e.exit("chunkString");
      const p = e.exit("gfmFootnoteCallString");
      return i.includes(we(r.sliceSerialize(p))) ? (e.enter("gfmFootnoteCallLabelMarker"), e.consume(c), e.exit("gfmFootnoteCallLabelMarker"), e.exit("gfmFootnoteCall"), t) : n(c);
    }
    return Y(c) || (o = !0), s++, e.consume(c), c === 92 ? f : l;
  }
  function f(c) {
    return c === 91 || c === 92 || c === 93 ? (e.consume(c), s++, l) : l(c);
  }
}
function Lp(e, t, n) {
  const r = this, i = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let s, o = 0, a;
  return u;
  function u(d) {
    return e.enter("gfmFootnoteDefinition")._container = !0, e.enter("gfmFootnoteDefinitionLabel"), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(d), e.exit("gfmFootnoteDefinitionLabelMarker"), l;
  }
  function l(d) {
    return d === 94 ? (e.enter("gfmFootnoteDefinitionMarker"), e.consume(d), e.exit("gfmFootnoteDefinitionMarker"), e.enter("gfmFootnoteDefinitionLabelString"), e.enter("chunkString").contentType = "string", f) : n(d);
  }
  function f(d) {
    if (
      // Too long.
      o > 999 || // Closing brace with nothing.
      d === 93 && !a || // Space or tab is not supported by GFM for some reason.
      // `\n` and `[` not being supported makes sense.
      d === null || d === 91 || Y(d)
    )
      return n(d);
    if (d === 93) {
      e.exit("chunkString");
      const y = e.exit("gfmFootnoteDefinitionLabelString");
      return s = we(r.sliceSerialize(y)), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(d), e.exit("gfmFootnoteDefinitionLabelMarker"), e.exit("gfmFootnoteDefinitionLabel"), p;
    }
    return Y(d) || (a = !0), o++, e.consume(d), d === 92 ? c : f;
  }
  function c(d) {
    return d === 91 || d === 92 || d === 93 ? (e.consume(d), o++, f) : f(d);
  }
  function p(d) {
    return d === 58 ? (e.enter("definitionMarker"), e.consume(d), e.exit("definitionMarker"), i.includes(s) || i.push(s), K(e, h, "gfmFootnoteDefinitionWhitespace")) : n(d);
  }
  function h(d) {
    return t(d);
  }
}
function Np(e, t, n) {
  return e.check(Tt, t, e.attempt(vp, t, n));
}
function Ap(e) {
  e.exit("gfmFootnoteDefinition");
}
function Rp(e, t, n) {
  const r = this;
  return K(e, i, "gfmFootnoteDefinitionIndent", 5);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return o && o[1].type === "gfmFootnoteDefinitionIndent" && o[2].sliceSerialize(o[1], !0).length === 4 ? t(s) : n(s);
  }
}
function Op(e) {
  let n = (e || {}).singleTilde;
  const r = {
    name: "strikethrough",
    tokenize: s,
    resolveAll: i
  };
  return n == null && (n = !0), {
    text: {
      126: r
    },
    insideSpan: {
      null: [r]
    },
    attentionMarkers: {
      null: [126]
    }
  };
  function i(o, a) {
    let u = -1;
    for (; ++u < o.length; )
      if (o[u][0] === "enter" && o[u][1].type === "strikethroughSequenceTemporary" && o[u][1]._close) {
        let l = u;
        for (; l--; )
          if (o[l][0] === "exit" && o[l][1].type === "strikethroughSequenceTemporary" && o[l][1]._open && // If the sizes are the same:
          o[u][1].end.offset - o[u][1].start.offset === o[l][1].end.offset - o[l][1].start.offset) {
            o[u][1].type = "strikethroughSequence", o[l][1].type = "strikethroughSequence";
            const f = {
              type: "strikethrough",
              start: Object.assign({}, o[l][1].start),
              end: Object.assign({}, o[u][1].end)
            }, c = {
              type: "strikethroughText",
              start: Object.assign({}, o[l][1].end),
              end: Object.assign({}, o[u][1].start)
            }, p = [["enter", f, a], ["enter", o[l][1], a], ["exit", o[l][1], a], ["enter", c, a]], h = a.parser.constructs.insideSpan.null;
            h && me(p, p.length, 0, Jt(h, o.slice(l + 1, u), a)), me(p, p.length, 0, [["exit", c, a], ["enter", o[u][1], a], ["exit", o[u][1], a], ["exit", f, a]]), me(o, l - 1, u - l + 3, p), u = l + p.length - 2;
            break;
          }
      }
    for (u = -1; ++u < o.length; )
      o[u][1].type === "strikethroughSequenceTemporary" && (o[u][1].type = "data");
    return o;
  }
  function s(o, a, u) {
    const l = this.previous, f = this.events;
    let c = 0;
    return p;
    function p(d) {
      return l === 126 && f[f.length - 1][1].type !== "characterEscape" ? u(d) : (o.enter("strikethroughSequenceTemporary"), h(d));
    }
    function h(d) {
      const y = nt(l);
      if (d === 126)
        return c > 1 ? u(d) : (o.consume(d), c++, h);
      if (c < 2 && !n) return u(d);
      const x = o.exit("strikethroughSequenceTemporary"), b = nt(d);
      return x._open = !b || b === 2 && !!y, x._close = !y || y === 2 && !!b, a(d);
    }
  }
}
class Pp {
  /**
   * Create a new edit map.
   */
  constructor() {
    this.map = [];
  }
  /**
   * Create an edit: a remove and/or add at a certain place.
   *
   * @param {number} index
   * @param {number} remove
   * @param {Array<Event>} add
   * @returns {undefined}
   */
  add(t, n, r) {
    Dp(this, t, n, r);
  }
  // To do: add this when moving to `micromark`.
  // /**
  //  * Create an edit: but insert `add` before existing additions.
  //  *
  //  * @param {number} index
  //  * @param {number} remove
  //  * @param {Array<Event>} add
  //  * @returns {undefined}
  //  */
  // addBefore(index, remove, add) {
  //   addImplementation(this, index, remove, add, true)
  // }
  /**
   * Done, change the events.
   *
   * @param {Array<Event>} events
   * @returns {undefined}
   */
  consume(t) {
    if (this.map.sort(function(s, o) {
      return s[0] - o[0];
    }), this.map.length === 0)
      return;
    let n = this.map.length;
    const r = [];
    for (; n > 0; )
      n -= 1, r.push(t.slice(this.map[n][0] + this.map[n][1]), this.map[n][2]), t.length = this.map[n][0];
    r.push(t.slice()), t.length = 0;
    let i = r.pop();
    for (; i; ) {
      for (const s of i)
        t.push(s);
      i = r.pop();
    }
    this.map.length = 0;
  }
}
function Dp(e, t, n, r) {
  let i = 0;
  if (!(n === 0 && r.length === 0)) {
    for (; i < e.map.length; ) {
      if (e.map[i][0] === t) {
        e.map[i][1] += n, e.map[i][2].push(...r);
        return;
      }
      i += 1;
    }
    e.map.push([t, n, r]);
  }
}
function _p(e, t) {
  let n = !1;
  const r = [];
  for (; t < e.length; ) {
    const i = e[t];
    if (n) {
      if (i[0] === "enter")
        i[1].type === "tableContent" && r.push(e[t + 1][1].type === "tableDelimiterMarker" ? "left" : "none");
      else if (i[1].type === "tableContent") {
        if (e[t - 1][1].type === "tableDelimiterMarker") {
          const s = r.length - 1;
          r[s] = r[s] === "left" ? "center" : "right";
        }
      } else if (i[1].type === "tableDelimiterRow")
        break;
    } else i[0] === "enter" && i[1].type === "tableDelimiterRow" && (n = !0);
    t += 1;
  }
  return r;
}
function Fp() {
  return {
    flow: {
      null: {
        name: "table",
        tokenize: zp,
        resolveAll: Mp
      }
    }
  };
}
function zp(e, t, n) {
  const r = this;
  let i = 0, s = 0, o;
  return a;
  function a(k) {
    let L = r.events.length - 1;
    for (; L > -1; ) {
      const P = r.events[L][1].type;
      if (P === "lineEnding" || // Note: markdown-rs uses `whitespace` instead of `linePrefix`
      P === "linePrefix") L--;
      else break;
    }
    const R = L > -1 ? r.events[L][1].type : null, _ = R === "tableHead" || R === "tableRow" ? S : u;
    return _ === S && r.parser.lazy[r.now().line] ? n(k) : _(k);
  }
  function u(k) {
    return e.enter("tableHead"), e.enter("tableRow"), l(k);
  }
  function l(k) {
    return k === 124 || (o = !0, s += 1), f(k);
  }
  function f(k) {
    return k === null ? n(k) : F(k) ? s > 1 ? (s = 0, r.interrupt = !0, e.exit("tableRow"), e.enter("lineEnding"), e.consume(k), e.exit("lineEnding"), h) : n(k) : H(k) ? K(e, f, "whitespace")(k) : (s += 1, o && (o = !1, i += 1), k === 124 ? (e.enter("tableCellDivider"), e.consume(k), e.exit("tableCellDivider"), o = !0, f) : (e.enter("data"), c(k)));
  }
  function c(k) {
    return k === null || k === 124 || Y(k) ? (e.exit("data"), f(k)) : (e.consume(k), k === 92 ? p : c);
  }
  function p(k) {
    return k === 92 || k === 124 ? (e.consume(k), c) : c(k);
  }
  function h(k) {
    return r.interrupt = !1, r.parser.lazy[r.now().line] ? n(k) : (e.enter("tableDelimiterRow"), o = !1, H(k) ? K(e, d, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(k) : d(k));
  }
  function d(k) {
    return k === 45 || k === 58 ? x(k) : k === 124 ? (o = !0, e.enter("tableCellDivider"), e.consume(k), e.exit("tableCellDivider"), y) : O(k);
  }
  function y(k) {
    return H(k) ? K(e, x, "whitespace")(k) : x(k);
  }
  function x(k) {
    return k === 58 ? (s += 1, o = !0, e.enter("tableDelimiterMarker"), e.consume(k), e.exit("tableDelimiterMarker"), b) : k === 45 ? (s += 1, b(k)) : k === null || F(k) ? I(k) : O(k);
  }
  function b(k) {
    return k === 45 ? (e.enter("tableDelimiterFiller"), v(k)) : O(k);
  }
  function v(k) {
    return k === 45 ? (e.consume(k), v) : k === 58 ? (o = !0, e.exit("tableDelimiterFiller"), e.enter("tableDelimiterMarker"), e.consume(k), e.exit("tableDelimiterMarker"), w) : (e.exit("tableDelimiterFiller"), w(k));
  }
  function w(k) {
    return H(k) ? K(e, I, "whitespace")(k) : I(k);
  }
  function I(k) {
    return k === 124 ? d(k) : k === null || F(k) ? !o || i !== s ? O(k) : (e.exit("tableDelimiterRow"), e.exit("tableHead"), t(k)) : O(k);
  }
  function O(k) {
    return n(k);
  }
  function S(k) {
    return e.enter("tableRow"), z(k);
  }
  function z(k) {
    return k === 124 ? (e.enter("tableCellDivider"), e.consume(k), e.exit("tableCellDivider"), z) : k === null || F(k) ? (e.exit("tableRow"), t(k)) : H(k) ? K(e, z, "whitespace")(k) : (e.enter("data"), V(k));
  }
  function V(k) {
    return k === null || k === 124 || Y(k) ? (e.exit("data"), z(k)) : (e.consume(k), k === 92 ? D : V);
  }
  function D(k) {
    return k === 92 || k === 124 ? (e.consume(k), V) : V(k);
  }
}
function Mp(e, t) {
  let n = -1, r = !0, i = 0, s = [0, 0, 0, 0], o = [0, 0, 0, 0], a = !1, u = 0, l, f, c;
  const p = new Pp();
  for (; ++n < e.length; ) {
    const h = e[n], d = h[1];
    h[0] === "enter" ? d.type === "tableHead" ? (a = !1, u !== 0 && (Ti(p, t, u, l, f), f = void 0, u = 0), l = {
      type: "table",
      start: Object.assign({}, d.start),
      // Note: correct end is set later.
      end: Object.assign({}, d.end)
    }, p.add(n, 0, [["enter", l, t]])) : d.type === "tableRow" || d.type === "tableDelimiterRow" ? (r = !0, c = void 0, s = [0, 0, 0, 0], o = [0, n + 1, 0, 0], a && (a = !1, f = {
      type: "tableBody",
      start: Object.assign({}, d.start),
      // Note: correct end is set later.
      end: Object.assign({}, d.end)
    }, p.add(n, 0, [["enter", f, t]])), i = d.type === "tableDelimiterRow" ? 2 : f ? 3 : 1) : i && (d.type === "data" || d.type === "tableDelimiterMarker" || d.type === "tableDelimiterFiller") ? (r = !1, o[2] === 0 && (s[1] !== 0 && (o[0] = o[1], c = _t(p, t, s, i, void 0, c), s = [0, 0, 0, 0]), o[2] = n)) : d.type === "tableCellDivider" && (r ? r = !1 : (s[1] !== 0 && (o[0] = o[1], c = _t(p, t, s, i, void 0, c)), s = o, o = [s[1], n, 0, 0])) : d.type === "tableHead" ? (a = !0, u = n) : d.type === "tableRow" || d.type === "tableDelimiterRow" ? (u = n, s[1] !== 0 ? (o[0] = o[1], c = _t(p, t, s, i, n, c)) : o[1] !== 0 && (c = _t(p, t, o, i, n, c)), i = 0) : i && (d.type === "data" || d.type === "tableDelimiterMarker" || d.type === "tableDelimiterFiller") && (o[3] = n);
  }
  for (u !== 0 && Ti(p, t, u, l, f), p.consume(t.events), n = -1; ++n < t.events.length; ) {
    const h = t.events[n];
    h[0] === "enter" && h[1].type === "table" && (h[1]._align = _p(t.events, n));
  }
  return e;
}
function _t(e, t, n, r, i, s) {
  const o = r === 1 ? "tableHeader" : r === 2 ? "tableDelimiter" : "tableData", a = "tableContent";
  n[0] !== 0 && (s.end = Object.assign({}, et(t.events, n[0])), e.add(n[0], 0, [["exit", s, t]]));
  const u = et(t.events, n[1]);
  if (s = {
    type: o,
    start: Object.assign({}, u),
    // Note: correct end is set later.
    end: Object.assign({}, u)
  }, e.add(n[1], 0, [["enter", s, t]]), n[2] !== 0) {
    const l = et(t.events, n[2]), f = et(t.events, n[3]), c = {
      type: a,
      start: Object.assign({}, l),
      end: Object.assign({}, f)
    };
    if (e.add(n[2], 0, [["enter", c, t]]), r !== 2) {
      const p = t.events[n[2]], h = t.events[n[3]];
      if (p[1].end = Object.assign({}, h[1].end), p[1].type = "chunkText", p[1].contentType = "text", n[3] > n[2] + 1) {
        const d = n[2] + 1, y = n[3] - n[2] - 1;
        e.add(d, y, []);
      }
    }
    e.add(n[3] + 1, 0, [["exit", c, t]]);
  }
  return i !== void 0 && (s.end = Object.assign({}, et(t.events, i)), e.add(i, 0, [["exit", s, t]]), s = void 0), s;
}
function Ti(e, t, n, r, i) {
  const s = [], o = et(t.events, n);
  i && (i.end = Object.assign({}, o), s.push(["exit", i, t])), r.end = Object.assign({}, o), s.push(["exit", r, t]), e.add(n + 1, 0, s);
}
function et(e, t) {
  const n = e[t], r = n[0] === "enter" ? "start" : "end";
  return n[1][r];
}
const jp = {
  name: "tasklistCheck",
  tokenize: Bp
};
function $p() {
  return {
    text: {
      91: jp
    }
  };
}
function Bp(e, t, n) {
  const r = this;
  return i;
  function i(u) {
    return (
      // Exit if there’s stuff before.
      r.previous !== null || // Exit if not in the first content that is the first child of a list
      // item.
      !r._gfmTasklistFirstContentOfListItem ? n(u) : (e.enter("taskListCheck"), e.enter("taskListCheckMarker"), e.consume(u), e.exit("taskListCheckMarker"), s)
    );
  }
  function s(u) {
    return Y(u) ? (e.enter("taskListCheckValueUnchecked"), e.consume(u), e.exit("taskListCheckValueUnchecked"), o) : u === 88 || u === 120 ? (e.enter("taskListCheckValueChecked"), e.consume(u), e.exit("taskListCheckValueChecked"), o) : n(u);
  }
  function o(u) {
    return u === 93 ? (e.enter("taskListCheckMarker"), e.consume(u), e.exit("taskListCheckMarker"), e.exit("taskListCheck"), a) : n(u);
  }
  function a(u) {
    return F(u) ? t(u) : H(u) ? e.check({
      tokenize: Up
    }, t, n)(u) : n(u);
  }
}
function Up(e, t, n) {
  return K(e, r, "whitespace");
  function r(i) {
    return i === null ? n(i) : t(i);
  }
}
function Hp(e) {
  return ss([
    dp(),
    Cp(),
    Op(e),
    Fp(),
    $p()
  ]);
}
const Vp = {};
function qp(e) {
  const t = (
    /** @type {Processor<Root>} */
    this
  ), n = e || Vp, r = t.data(), i = r.micromarkExtensions || (r.micromarkExtensions = []), s = r.fromMarkdownExtensions || (r.fromMarkdownExtensions = []), o = r.toMarkdownExtensions || (r.toMarkdownExtensions = []);
  i.push(Hp(n)), s.push(cp()), o.push(fp(n));
}
const Kp = {
  a: ({ node: e, ...t }) => /* @__PURE__ */ E("a", { target: "_blank", rel: "noopener noreferrer", ...t }),
  // react-markdown v10 removed the `inline` prop; detect inline via the absence
  // of a language- className and of newlines (block code lives inside <pre>).
  code: ({ node: e, className: t, children: n, ...r }) => !/^language-/.test(t || "") && !String(n).includes(`
`) ? /* @__PURE__ */ E("code", { className: "fdv2-md-code-inline", ...r, children: n }) : /* @__PURE__ */ E("code", { className: t, ...r, children: n }),
  table: ({ node: e, ...t }) => /* @__PURE__ */ E("div", { className: "fdv2-md-table-wrap", children: /* @__PURE__ */ E("table", { ...t }) })
};
function Wp({ children: e }) {
  return /* @__PURE__ */ E("div", { className: "fdv2-md", children: /* @__PURE__ */ E(Of, { remarkPlugins: [qp], components: Kp, children: e || "" }) });
}
function En(e, t) {
  return t ? e === "beneficiary" ? `${t.name || t.userId}${t.email ? ` (${t.email})` : ""}` : t.name || t.code || "" : "";
}
function Gp({ resolveChoices: e }) {
  const { t } = xe(), { loading: n } = it(), r = Ge(), [i, s] = he(null), [o, a] = he(""), { slotId: u, default: l, alternatives: f = [], allowSearch: c } = e, p = () => r.sendChoice({ slotId: u, action: "confirm", value: l }, En(u, l)), h = (y) => r.sendChoice({ slotId: u, action: "select", value: y }, En(u, y)), d = () => {
    const y = o.trim();
    y && r.sendChoice({ slotId: u, action: "search", value: y }, y);
  };
  return /* @__PURE__ */ $("div", { className: "fdv2-choice", children: [
    /* @__PURE__ */ $("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ E("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", onClick: p, disabled: n, children: t("choice.yes") }),
      f.length > 0 && /* @__PURE__ */ $("button", { type: "button", className: "fdv2-choice-btn", onClick: () => s(i === "list" ? null : "list"), disabled: n, children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      c && /* @__PURE__ */ E("button", { type: "button", className: "fdv2-choice-btn", onClick: () => s(i === "search" ? null : "search"), disabled: n, children: t("choice.search") })
    ] }),
    i === "list" && /* @__PURE__ */ E("ul", { className: "fdv2-choice-list", children: f.map((y, x) => /* @__PURE__ */ E("li", { children: /* @__PURE__ */ E("button", { type: "button", onClick: () => h(y), disabled: n, children: En(u, y) }) }, y.userId || y.code || x)) }),
    i === "search" && /* @__PURE__ */ $("div", { className: "fdv2-choice-search", children: [
      /* @__PURE__ */ E(
        "input",
        {
          className: "fdv2-slot-input",
          value: o,
          onChange: (y) => a(y.target.value),
          onKeyDown: (y) => {
            y.key === "Enter" && (y.preventDefault(), d());
          },
          placeholder: t(u === "location" ? "choice.searchLocation" : "choice.searchUser"),
          disabled: n,
          autoFocus: !0
        }
      ),
      /* @__PURE__ */ E("button", { type: "button", className: "fdv2-choice-btn", onClick: d, disabled: n || !o.trim(), children: t("choice.find") })
    ] })
  ] });
}
function Li({ control: e, onPick: t }) {
  const { t: n } = xe(), { loading: r } = it(), i = e.source || {}, s = i.minChars || 2, o = i.directory || "user", [a, u] = he(""), [l, f] = he([]), [c, p] = he(!1), h = ae(null);
  be(() => {
    const y = a.trim();
    if (y.length < s) {
      f([]), p(!1);
      return;
    }
    return p(!0), clearTimeout(h.current), h.current = setTimeout(async () => {
      try {
        const b = await (await rt()(
          Hn(`/flowdesk/directory/${encodeURIComponent(o)}?q=${encodeURIComponent(y)}&limit=8`),
          { headers: await Ke() }
        )).json().catch(() => ({}));
        f(Array.isArray(b.results) ? b.results : []);
      } catch {
        f([]);
      } finally {
        p(!1);
      }
    }, 300), () => clearTimeout(h.current);
  }, [a, s, o]);
  const d = i.placeholder || n(o === "location" ? "choice.searchLocation" : "choice.searchUser");
  return /* @__PURE__ */ $("div", { className: "fdv2-autocomplete fdv2-choice-search", children: [
    /* @__PURE__ */ E(
      "input",
      {
        className: "fdv2-slot-input",
        value: a,
        onChange: (y) => u(y.target.value),
        placeholder: d,
        disabled: r,
        autoFocus: !0
      }
    ),
    c && /* @__PURE__ */ E("span", { className: "fdv2-ac-loading", "aria-hidden": "true", children: "…" }),
    l.length > 0 && /* @__PURE__ */ E("ul", { className: "fdv2-choice-list", children: l.map((y) => /* @__PURE__ */ E("li", { children: /* @__PURE__ */ $("button", { type: "button", disabled: r, onClick: () => t(y), children: [
      y.label,
      y.sublabel ? ` — ${y.sublabel}` : ""
    ] }) }, y.value)) })
  ] });
}
const Ni = (e) => `${e.label}${e.description ? ` — ${e.description}` : ""}`;
function Ai(e, t) {
  return e === "location" ? { code: t.value, name: t.label } : { userId: t.value, name: t.label, ...t.meta && t.meta.email ? { email: t.meta.email } : {} };
}
function Ys({ control: e }) {
  const { t } = xe(), { loading: n } = it(), r = Ge(), [i, s] = he(null), { id: o, type: a, slotId: u, label: l, defaultValue: f, options: c = [], children: p = [], showChildrenOn: h } = e, d = (w, I, O) => r.sendControlAction({ controlId: o, slotId: u, action: w, value: I }, O), y = h === "_search" && p.some((w) => w.type === "autocomplete"), x = i != null && i !== "list" && i === h ? p : [], b = (w) => w.type === "autocomplete" ? /* @__PURE__ */ E(Li, { control: w, onPick: (I) => d("submit", Ai(w.source?.directory, I), I.label) }, w.id) : /* @__PURE__ */ E("div", { className: "fdv2-control-child", children: /* @__PURE__ */ E(Ys, { control: w }) }, w.id), v = (w) => {
    if (p.length && h === w.value) {
      s(i === w.value ? null : w.value);
      return;
    }
    d("select", w.value, w.label);
  };
  return /* @__PURE__ */ $("div", { className: "fdv2-control", children: [
    l && a === "choice" && /* @__PURE__ */ E("div", { className: "fdv2-control-label", children: l }),
    /* @__PURE__ */ $("div", { className: "fdv2-choice-row", children: [
      a === "confirm" && /* @__PURE__ */ E("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", disabled: n, onClick: () => d("confirm", void 0, t("choice.yes")), children: t("choice.yes") }),
      a === "choice" && c.map((w) => /* @__PURE__ */ E("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => v(w), children: Ni(w) }, w.value)),
      a === "confirm" && c.length > 0 && /* @__PURE__ */ $("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => s(i === "list" ? null : "list"), children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      a === "confirm" && y && /* @__PURE__ */ E("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => s(i === "_search" ? null : "_search"), children: t("choice.search") })
    ] }),
    a === "confirm" && i === "list" && /* @__PURE__ */ E("ul", { className: "fdv2-choice-list", children: c.map((w) => /* @__PURE__ */ E("li", { children: /* @__PURE__ */ E("button", { type: "button", disabled: n, onClick: () => d("select", w.value, w.label), children: Ni(w) }) }, w.value)) }),
    a === "autocomplete" && /* @__PURE__ */ E(Li, { control: e, onPick: (w) => d("submit", Ai(e.source?.directory, w), w.label) }),
    x.map(b)
  ] });
}
function Jp({ controls: e }) {
  return !Array.isArray(e) || e.length === 0 ? null : /* @__PURE__ */ E("div", { className: "fdv2-controls", children: e.map((t) => /* @__PURE__ */ E(Ys, { control: t }, t.id)) });
}
function Yp(e, t, n) {
  if (!e) return { label: "", full: "" };
  const r = new Date(e), i = r.toLocaleString(n), s = Date.now() - r.getTime();
  return s < 6e4 ? { label: t("time.justNow"), full: i } : s < 36e5 ? { label: t("time.minutesAgo", { count: Math.floor(s / 6e4) }), full: i } : { label: r.toLocaleTimeString(n, { hour: "2-digit", minute: "2-digit" }), full: i };
}
function Qp({ message: e, isLast: t }) {
  const { t: n, i18n: r } = xe(), { role: i, content: s, timestamp: o, metadata: a } = e, u = Yp(o, n, r.language), l = t && i === "assistant" && Array.isArray(a?.controls) && a.controls.length > 0, f = !l && t && i === "assistant" && a?.responseType === "confirm_or_choose" && a?.resolveChoices;
  if (i === "system")
    return /* @__PURE__ */ E("div", { className: "fdv2-message fdv2-message-system", children: /* @__PURE__ */ E("span", { className: "fdv2-system-text", children: s }) });
  const c = i === "user", p = a?.executionLog;
  return /* @__PURE__ */ $("div", { className: `fdv2-message ${c ? "fdv2-message-user" : "fdv2-message-assistant"}`, children: [
    !c && /* @__PURE__ */ E("div", { className: "fdv2-avatar", "aria-hidden": "true", children: "◆" }),
    /* @__PURE__ */ $("div", { className: "fdv2-bubble-col", children: [
      /* @__PURE__ */ E("span", { className: "fdv2-sender", children: n(c ? "senderMe" : "agentName") }),
      !c && a?.preamble && /* @__PURE__ */ E("p", { className: "fdv2-preamble", children: a.preamble }),
      /* @__PURE__ */ E("div", { className: "fdv2-bubble", children: c ? /* @__PURE__ */ E("span", { className: "fdv2-user-text", children: s }) : /* @__PURE__ */ E(Wp, { children: s }) }),
      l && /* @__PURE__ */ E(Jp, { controls: a.controls }),
      f && /* @__PURE__ */ E(Gp, { resolveChoices: a.resolveChoices }),
      /* @__PURE__ */ $("div", { className: "fdv2-message-meta", children: [
        /* @__PURE__ */ E("time", { dateTime: o, title: u.full, children: u.label }),
        a?.srNumber && /* @__PURE__ */ E("span", { className: "fdv2-sr-chip", children: a.srNumber }),
        Array.isArray(p) && p.length > 0 && /* @__PURE__ */ $("details", { className: "fdv2-exec-log", children: [
          /* @__PURE__ */ E("summary", { children: n("meta.details", { count: p.length }) }),
          /* @__PURE__ */ E("ol", { children: p.map((h, d) => /* @__PURE__ */ E("li", { className: h.status === "error" ? "err" : "", children: h.node }, d)) })
        ] })
      ] })
    ] })
  ] });
}
function Xp({ children: e, emptyState: t }) {
  const { t: n } = xe(), r = ba(), i = Ge(), s = ae(null), o = ae(null), a = ae(0);
  be(() => {
    const l = s.current;
    if (!l) return;
    const f = r.length > a.current;
    if (a.current = r.length, !f) return;
    const c = l.scrollHeight - l.scrollTop - l.clientHeight < 120, p = r[r.length - 1];
    (c || p?.role === "assistant" || p?.role === "system") && o.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [r]);
  const u = () => {
    window.confirm(n("resetConfirm")) && i.resetSession();
  };
  return /* @__PURE__ */ $("div", { className: "fdv2-messages-wrap", children: [
    /* @__PURE__ */ E("div", { className: "fdv2-messages", ref: s, children: /* @__PURE__ */ $("div", { className: "fdv2-messages-inner", children: [
      r.length === 0 ? (
        // Host-injectable pre-conversation slot; falls back to a bare greeting.
        t != null ? /* @__PURE__ */ E("div", { className: "fdv2-empty fdv2-empty-custom", children: t }) : /* @__PURE__ */ $("div", { className: "fdv2-empty", children: [
          /* @__PURE__ */ E("div", { className: "fdv2-empty-icon", children: "◆" }),
          /* @__PURE__ */ E("h2", { children: n("emptyTitle") })
        ] })
      ) : r.map((l, f) => /* @__PURE__ */ E(Qp, { message: l, isLast: f === r.length - 1 }, l.id)),
      e,
      /* @__PURE__ */ E("div", { ref: o })
    ] }) }),
    r.length > 0 && /* @__PURE__ */ $(
      "button",
      {
        type: "button",
        className: "fdv2-newchat",
        onClick: u,
        title: n("newChat"),
        "aria-label": n("newChat"),
        children: [
          /* @__PURE__ */ $("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
            /* @__PURE__ */ E("path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }),
            /* @__PURE__ */ E("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })
          ] }),
          /* @__PURE__ */ E("span", { className: "fdv2-newchat-label", children: n("newChat") })
        ]
      }
    )
  ] });
}
const Zp = 24e3, ed = `
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._target = 2400; // ~100ms @ 24kHz
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
      while (this._buf.length >= this._target) {
        const frame = this._buf.splice(0, this._target);
        this.port.postMessage(Float32Array.from(frame));
      }
    }
    return true;
  }
}
registerProcessor('fdv2-capture', CaptureProcessor);
`;
function td(e) {
  const t = new Int16Array(e.length);
  for (let i = 0; i < e.length; i++) {
    const s = Math.max(-1, Math.min(1, e[i]));
    t[i] = s < 0 ? s * 32768 : s * 32767;
  }
  const n = new Uint8Array(t.buffer);
  let r = "";
  for (let i = 0; i < n.length; i++) r += String.fromCharCode(n[i]);
  return btoa(r);
}
class nd {
  constructor({ onFrame: t } = {}) {
    this.onFrame = t, this.ctx = null, this.stream = null, this.node = null, this.source = null;
  }
  /** Request the mic and start streaming frames. Throws if permission denied. */
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: !0, noiseSuppression: !0, autoGainControl: !0 }
    });
    const t = window.AudioContext || window.webkitAudioContext;
    this.ctx = new t({ sampleRate: Zp }), this.ctx.state === "suspended" && await this.ctx.resume();
    const n = URL.createObjectURL(new Blob([ed], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(n);
    } finally {
      URL.revokeObjectURL(n);
    }
    this.source = this.ctx.createMediaStreamSource(this.stream), this.node = new AudioWorkletNode(this.ctx, "fdv2-capture"), this.node.port.onmessage = (r) => {
      this.onFrame && this.onFrame(td(r.data));
    }, this.source.connect(this.node);
  }
  async stop() {
    try {
      this.node && (this.node.port.onmessage = null);
    } catch {
    }
    try {
      this.source && this.source.disconnect();
    } catch {
    }
    try {
      this.node && this.node.disconnect();
    } catch {
    }
    if (this.stream) {
      for (const t of this.stream.getTracks()) t.stop();
      this.stream = null;
    }
    if (this.ctx) {
      try {
        await this.ctx.close();
      } catch {
      }
      this.ctx = null;
    }
  }
}
const Ri = 24e3;
function rd(e) {
  const t = atob(e), n = t.length, r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[i] = t.charCodeAt(i);
  return new Int16Array(r.buffer, 0, n >> 1);
}
function id(e) {
  const t = new Float32Array(e.length);
  for (let n = 0; n < e.length; n++) t[n] = Math.max(-1, e[n] / 32768);
  return t;
}
class sd {
  constructor({ onStarted: t, onEnded: n } = {}) {
    this.ctx = null, this.nextStartTime = 0, this.activeSources = /* @__PURE__ */ new Set(), this.playing = !1, this.onStarted = t, this.onEnded = n, this._endTimer = null;
  }
  _ensureCtx() {
    if (!this.ctx) {
      const t = window.AudioContext || window.webkitAudioContext;
      this.ctx = new t({ sampleRate: Ri });
    }
    return this.ctx.state === "suspended" && this.ctx.resume(), this.ctx;
  }
  /**
   * Create + resume the output AudioContext eagerly. MUST be called from within a
   * user gesture (the Live Chat click) — browsers keep an AudioContext suspended
   * if it is first touched outside a gesture, which silences the agent's TTS even
   * though audio frames arrive. Called at session start so playback is unlocked
   * before the first `audio` frame (which arrives outside any gesture).
   */
  unlock() {
    const t = this._ensureCtx();
    return t && t.state === "running" && (this.nextStartTime = Math.max(this.nextStartTime, t.currentTime)), t && t.state;
  }
  /** Enqueue one base64 PCM16 delta for gapless playback. */
  enqueue(t) {
    const n = this._ensureCtx(), r = id(rd(t));
    if (r.length === 0) return;
    const i = n.createBuffer(1, r.length, Ri);
    i.getChannelData(0).set(r);
    const s = n.createBufferSource();
    s.buffer = i, s.connect(n.destination);
    const o = n.currentTime, a = Math.max(o, this.nextStartTime);
    this.playing || (this.playing = !0, this.onStarted && this.onStarted()), s.start(a), this.nextStartTime = a + i.duration, this.activeSources.add(s), s.onended = () => {
      this.activeSources.delete(s), this._endTimer && clearTimeout(this._endTimer), this._endTimer = setTimeout(() => {
        this.activeSources.size === 0 && this.playing && (this.playing = !1, this.onEnded && this.onEnded());
      }, 60);
    };
  }
  /** Barge-in / cancel: stop everything currently scheduled. */
  clear() {
    for (const t of this.activeSources)
      try {
        t.onended = null, t.stop();
      } catch {
      }
    this.activeSources.clear(), this.nextStartTime = this.ctx ? this.ctx.currentTime : 0, this.playing && (this.playing = !1, this.onEnded && this.onEnded());
  }
  async close() {
    if (this.clear(), this.ctx) {
      try {
        await this.ctx.close();
      } catch {
      }
      this.ctx = null;
    }
  }
}
const X = {
  IDLE: "idle",
  CONNECTING: "connecting",
  LISTENING: "listening",
  PROCESSING: "processing",
  SPEAKING: "speaking",
  ERROR: "error"
}, Oi = {
  listening: X.LISTENING,
  processing: X.PROCESSING,
  speaking: X.SPEAKING
};
class od {
  constructor({ sessionId: t, userId: n, lang: r, onState: i, onTranscript: s, onChoices: o, onError: a } = {}) {
    this.sessionId = t, this.userId = n || Ue().userId, this.lang = r || null, this.onState = i || (() => {
    }), this.onTranscript = s || (() => {
    }), this.onChoices = o || (() => {
    }), this.onError = a || (() => {
    }), this.ws = null, this.capture = null, this.playback = null, this.state = X.IDLE, this._closed = !1;
  }
  _setState(t) {
    this.state = t, this.onState(t);
  }
  async start() {
    this._setState(X.CONNECTING), this._ensurePlayback();
    try {
      this.playback.unlock();
    } catch {
    }
    try {
      const t = await this._fetchToken(), n = await Ke(), r = this._buildWsUrl(t, n);
      await this._openWs(r, t);
    } catch (t) {
      this._fail(t);
    }
  }
  async _fetchToken() {
    const t = await Ke({ "Content-Type": "application/json" }), n = await rt()(Hn("/flowdesk/voice/token"), {
      method: "POST",
      headers: t,
      credentials: "include",
      body: JSON.stringify({ sessionId: this.sessionId, userId: this.userId })
    });
    if (!n.ok) throw new Error(`voice token failed (HTTP ${n.status})`);
    const r = await n.json();
    if (r.wsUrl) throw new Error("unexpected direct wsUrl from token endpoint (key-leak guard)");
    if (!r.useProxy || !r.ticket) throw new Error("voice token missing proxy fields");
    return r;
  }
  _buildWsUrl(t, n = {}) {
    const r = new URL(Ue().apiBaseUrl, window.location.origin), i = r.protocol === "https:" ? "wss:" : "ws:", s = r.pathname.replace(/\/+$/, ""), o = t.proxySuffix || "/flowdesk/voice/proxy", a = new URLSearchParams();
    a.set("sessionId", this.sessionId), a.set("ticket", t.ticket), this.lang && a.set("lang", this.lang);
    const u = (c, ...p) => {
      for (const h of p)
        if (c && c[h]) return c[h];
      return null;
    }, l = u(n, "API-Key", "Api-Key", "api-key", "apikey");
    l && a.set("api_key", l);
    const f = u(n, "Authorization", "authorization");
    return f && /^Bearer\s+/i.test(f) && a.set("access_token", f.replace(/^Bearer\s+/i, "")), `${i}//${r.host}${s}${o}?${a.toString()}`;
  }
  _openWs(t, n) {
    return new Promise((r, i) => {
      const s = new WebSocket(t, [n.subprotocol || "realtime"]);
      this.ws = s;
      let o = !1;
      s.onopen = async () => {
        o || (o = !0, r());
        try {
          await this._startCapture(), this._setState(X.LISTENING);
        } catch (a) {
          this._fail(a);
        }
      }, s.onmessage = (a) => {
        let u;
        try {
          u = JSON.parse(a.data);
        } catch {
          return;
        }
        this._onServerEvent(u);
      }, s.onerror = () => {
        o || (o = !0, i(new Error("voice relay connection error")));
      }, s.onclose = () => {
        this._closed || this._teardown();
      };
    });
  }
  _onServerEvent(t) {
    switch (t.type) {
      case "state":
        Oi[t.status] && this._setState(Oi[t.status]);
        break;
      case "transcript":
        t.text && this.onTranscript(t.role || "assistant", t.text, { language: t.lang, meta: t.meta || null });
        break;
      case "choices":
        this.onChoices(t.items || []);
        break;
      case "audio":
        t.data && (this._ensurePlayback(), this.playback.enqueue(t.data));
        break;
      case "audioDone":
        break;
      case "error":
        this.onError(new Error(t.message || "voice error"));
        break;
    }
  }
  _ensurePlayback() {
    this.playback || (this.playback = new sd());
  }
  async _startCapture() {
    this.capture = new nd({
      onFrame: (t) => {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "audio", data: t }));
      }
    }), await this.capture.start();
  }
  _fail(t) {
    this._setState(X.ERROR), this.onError(t instanceof Error ? t : new Error(String(t))), this._teardown();
  }
  async _teardown() {
    if (!this._closed) {
      this._closed = !0;
      try {
        this.capture && await this.capture.stop();
      } catch {
      }
      try {
        this.playback && await this.playback.close();
      } catch {
      }
      try {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "stop" }));
      } catch {
      }
      try {
        this.ws && this.ws.close();
      } catch {
      }
    }
  }
  async stop() {
    await this._teardown(), this.state !== X.ERROR && this._setState(X.IDLE);
  }
}
function ad({ userId: e, lang: t } = {}) {
  const [n, r] = he(X.IDLE), [i, s] = he(null), o = ae(null), a = Ge(), u = _e((h) => h.session.id), l = De(async () => {
    const h = o.current;
    o.current = null, h && await h.stop(), r(X.IDLE);
  }, []), f = De(async () => {
    if (o.current) return;
    s(null);
    const h = new od({
      sessionId: u,
      userId: e || Ue().userId,
      lang: t,
      onState: r,
      onTranscript: (d, y, x) => {
        const b = { source: "voice" };
        d === "assistant" && x && x.meta && Object.assign(b, x.meta), a.addMessage(d, y, b);
      },
      onError: (d) => {
        s(d), r(X.ERROR), a.addMessage("system", `🎤 ${d.message}`), o.current = null;
      }
    });
    o.current = h, await h.start();
  }, [u, e, t, a]), c = De(() => o.current ? l() : f(), [f, l]);
  be(() => () => {
    o.current && o.current.stop();
  }, []);
  const p = n !== X.IDLE && n !== X.ERROR;
  return { state: n, error: i, isActive: p, start: f, stop: l, toggle: c };
}
function ld({ userId: e }) {
  const { t, i18n: n } = xe(), { state: r, isActive: i, toggle: s } = ad({ userId: e, lang: n.language }), o = t("liveChat"), a = r === X.CONNECTING, u = {
    [X.IDLE]: o,
    [X.CONNECTING]: t("liveChatConnecting", "Connecting…"),
    [X.LISTENING]: t("liveChatListening", "Listening…"),
    [X.PROCESSING]: t("liveChatProcessing", "Thinking…"),
    [X.SPEAKING]: t("liveChatSpeaking", "Speaking…"),
    [X.ERROR]: o
  }[r] || o;
  return /* @__PURE__ */ $(
    "button",
    {
      type: "button",
      className: `fdv2-icon-btn fdv2-livechat${i ? " is-active" : ""}`,
      "data-voice-state": r,
      onClick: s,
      "aria-pressed": i,
      title: u,
      "aria-label": u,
      children: [
        a ? (
          // spinner
          /* @__PURE__ */ E("svg", { className: "fdv2-spin", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ E("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }) })
        ) : i ? (
          // active mic (stop) glyph
          /* @__PURE__ */ $("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
            /* @__PURE__ */ E("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }),
            /* @__PURE__ */ E("path", { d: "M5 10a7 7 0 0 0 14 0" }),
            /* @__PURE__ */ E("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
          ] })
        ) : (
          // live-chat glyph: speech bubble
          /* @__PURE__ */ E("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ E("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" }) })
        ),
        /* @__PURE__ */ E("span", { className: "fdv2-livechat-label", children: u })
      ]
    }
  );
}
function ud({ onChange: e }) {
  const { t, i18n: n } = xe(), [r, i] = he(!1), s = ae(null), o = bt.find((l) => l.code === n.language) || bt[0], a = t("language", { defaultValue: "Language" });
  be(() => {
    if (!r) return;
    const l = (c) => {
      s.current && !s.current.contains(c.target) && i(!1);
    }, f = (c) => {
      c.key === "Escape" && i(!1);
    };
    return document.addEventListener("mousedown", l), document.addEventListener("keydown", f), () => {
      document.removeEventListener("mousedown", l), document.removeEventListener("keydown", f);
    };
  }, [r]);
  const u = (l) => {
    Bi(l), e && e(l), i(!1);
  };
  return /* @__PURE__ */ $("div", { className: "fdv2-lang", ref: s, children: [
    /* @__PURE__ */ $(
      "button",
      {
        type: "button",
        className: "fdv2-lang-btn",
        onClick: () => i((l) => !l),
        title: `${a}: ${o.label}`,
        "aria-label": `${a}: ${o.label}`,
        "aria-haspopup": "listbox",
        "aria-expanded": r,
        children: [
          /* @__PURE__ */ E("span", { className: "fdv2-lang-globe", "aria-hidden": "true", children: "🌐" }),
          /* @__PURE__ */ E("span", { className: "fdv2-lang-abbr", children: o.code.toUpperCase() })
        ]
      }
    ),
    r && /* @__PURE__ */ E("ul", { className: "fdv2-lang-menu", role: "listbox", "aria-label": a, children: bt.map((l) => /* @__PURE__ */ E("li", { role: "option", "aria-selected": l.code === o.code, children: /* @__PURE__ */ $(
      "button",
      {
        type: "button",
        className: `fdv2-lang-option ${l.code === o.code ? "is-active" : ""}`,
        onClick: () => u(l.code),
        dir: l.dir,
        children: [
          /* @__PURE__ */ E("span", { className: "fdv2-lang-option-abbr", children: l.code.toUpperCase() }),
          /* @__PURE__ */ E("span", { className: "fdv2-lang-option-label", children: l.label })
        ]
      }
    ) }, l.code)) })
  ] });
}
const cd = 8;
function fd({ userId: e, showVoiceControls: t = !0, showLanguageSwitcher: n = !0 }) {
  const { t: r } = xe(), { loading: i, composerDisabled: s } = it(), o = Ge(), [a, u] = he(""), l = ae(null), f = ae(null), c = De(() => {
    const x = l.current;
    if (!x) return;
    x.style.height = "auto";
    const v = (parseFloat(getComputedStyle(x).lineHeight) || 20) * cd;
    x.style.height = `${Math.min(x.scrollHeight, v)}px`, x.style.overflowY = x.scrollHeight > v ? "auto" : "hidden";
  }, []);
  be(() => {
    c();
  }, [a, c]), be(() => {
    !i && !s && l.current?.focus();
  }, [i, s]);
  const p = a.trim().length > 0 && !i && !s, h = De(async () => {
    const x = a.trim();
    if (!x || i || s) return;
    u("");
    const b = new AbortController();
    f.current = b;
    try {
      await o.sendMessage(x, e, b.signal);
    } finally {
      f.current = null, l.current?.focus();
    }
  }, [a, i, s, o, e]), d = De(() => {
    f.current?.abort();
  }, []);
  return /* @__PURE__ */ $("div", { className: "fdv2-composer-wrap", children: [
    /* @__PURE__ */ $("div", { className: `fdv2-composer ${s ? "is-disabled" : ""}`, children: [
      /* @__PURE__ */ E(
        "textarea",
        {
          ref: l,
          className: "fdv2-textarea",
          rows: 1,
          value: a,
          onChange: (x) => u(x.target.value),
          onKeyDown: (x) => {
            x.key === "Enter" && !x.shiftKey && (x.preventDefault(), h());
          },
          placeholder: r(s ? "composerDisabled" : "composerPlaceholder"),
          disabled: s,
          "aria-label": r("composerPlaceholder")
        }
      ),
      i ? /* @__PURE__ */ E("button", { type: "button", className: "fdv2-icon-btn fdv2-stop", onClick: d, title: r("stop"), "aria-label": r("stop"), children: /* @__PURE__ */ E("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ E("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) }) }) : /* @__PURE__ */ E("button", { type: "button", className: "fdv2-icon-btn fdv2-send", onClick: h, disabled: !p, title: r("send"), "aria-label": r("send"), children: /* @__PURE__ */ $("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
        /* @__PURE__ */ E("line", { x1: "12", y1: "19", x2: "12", y2: "5" }),
        /* @__PURE__ */ E("polyline", { points: "5 12 12 5 19 12" })
      ] }) }),
      (n || t) && /* @__PURE__ */ $("div", { className: "fdv2-composer-tools", children: [
        n && /* @__PURE__ */ E(ud, {}),
        t && /* @__PURE__ */ E(ld, { userId: e })
      ] })
    ] }),
    /* @__PURE__ */ E("div", { className: "fdv2-composer-hint", children: r("composerHint") })
  ] });
}
function hd() {
  const { t: e } = xe(), { loading: t, currentNode: n } = it();
  if (!t) return null;
  const r = n && e(`node.${n}`, { defaultValue: "" }) || e("thinking");
  return /* @__PURE__ */ $("div", { className: "fdv2-message fdv2-message-assistant fdv2-typing", "aria-live": "polite", children: [
    /* @__PURE__ */ E("div", { className: "fdv2-avatar", "aria-hidden": "true", children: "◆" }),
    /* @__PURE__ */ E("div", { className: "fdv2-bubble-col", children: /* @__PURE__ */ $("div", { className: "fdv2-typing-row", children: [
      /* @__PURE__ */ $("span", { className: "fdv2-typing-dots", "aria-hidden": "true", children: [
        /* @__PURE__ */ E("i", {}),
        /* @__PURE__ */ E("i", {}),
        /* @__PURE__ */ E("i", {})
      ] }),
      /* @__PURE__ */ E("span", { className: "fdv2-typing-text", children: r })
    ] }) })
  ] });
}
const pd = {
  extracted: "🤖",
  user_edited: "✏️",
  context: "📍",
  resolved: "⚙️"
};
function Qs(e, t, n, r = /* @__PURE__ */ new Set()) {
  return r.has(e) ? !1 : (r.add(e), t?.[e]?.stale ? !0 : ((n?.slots || []).find((a) => a.slotId === e)?.dependsOn || []).some((a) => Qs(a, t, n, r)));
}
function dd(e) {
  return (e?.phases || []).map((r) => ({
    phase: r,
    slots: (e?.slots || []).filter((i) => i.phase === r)
  })).filter((r) => r.slots.length > 0);
}
function gd(e) {
  return e == null || e === "" ? null : typeof e == "object" ? e.name || e.city || e.id || e.mode || JSON.stringify(e) : String(e);
}
function md({ slotDef: e, slotValue: t, affectedStale: n, onEdit: r }) {
  const { t: i } = xe(), [s, o] = he(!1), [a, u] = he(""), l = ae(null), f = gd(t?.value), c = t?.provenance || null, p = c ? pd[c] : null, h = c ? i(`provenance.${c}`, { defaultValue: c }) : "", d = e.type === "enum", x = !(t && typeof t.value == "object");
  be(() => {
    s && l.current?.focus();
  }, [s]);
  const b = () => {
    x && (u(d ? t?.value ?? "" : f ?? ""), o(!0));
  }, v = () => {
    o(!1);
    const I = a;
    I !== "" && I !== (t?.value ?? "") && r(e.slotId, I);
  }, w = (I) => {
    I.key === "Enter" && (I.preventDefault(), v()), I.key === "Escape" && o(!1);
  };
  return /* @__PURE__ */ $("div", { className: `fdv2-slot ${n ? "is-stale" : ""}`, children: [
    /* @__PURE__ */ $("div", { className: "fdv2-slot-label", children: [
      (e.promptHint, e.slotId),
      e.required && /* @__PURE__ */ E("span", { className: "fdv2-slot-req", title: i("slot.required"), children: "*" })
    ] }),
    /* @__PURE__ */ $("div", { className: "fdv2-slot-value", children: [
      s ? d ? /* @__PURE__ */ $("select", { ref: l, value: a, onChange: (I) => u(I.target.value), onBlur: v, onKeyDown: w, className: "fdv2-slot-input", children: [
        /* @__PURE__ */ E("option", { value: "", disabled: !0, children: "—" }),
        (e.presentOptions || []).map((I) => /* @__PURE__ */ E("option", { value: I.value, children: I.label }, I.value))
      ] }) : /* @__PURE__ */ E("input", { ref: l, value: a, onChange: (I) => u(I.target.value), onBlur: v, onKeyDown: w, className: "fdv2-slot-input" }) : /* @__PURE__ */ E("button", { type: "button", className: `fdv2-slot-val-btn ${f ? "" : "is-empty"} ${x ? "" : "is-readonly"}`, onClick: b, title: x ? i("slot.edit") : "", children: f || "—" }),
      p && /* @__PURE__ */ E("span", { className: "fdv2-slot-prov", title: h, "aria-label": h, children: p }),
      n && /* @__PURE__ */ E("span", { className: "fdv2-slot-stale", title: i("slot.stale"), children: "⚠️" })
    ] })
  ] });
}
function yd() {
  const { t: e } = xe(), t = xa(), n = ka(), r = Vi(), { draftPanelOpen: i } = it(), s = Ge(), o = !!r.serviceId;
  if (!i)
    return /* @__PURE__ */ E("div", { className: "fdv2-draft-collapsed", children: /* @__PURE__ */ E("button", { type: "button", className: "fdv2-icon-btn", onClick: s.toggleDraftPanel, title: e("draft.expand"), "aria-label": e("draft.expand"), children: "▸" }) });
  const a = n?.metadata?.title || r.serviceId || e("draft.title"), u = e(`status.${r.status || "draft"}`, { defaultValue: r.status || "" }), l = n ? dd(n) : [], f = t.beneficiary;
  return /* @__PURE__ */ $("div", { className: "fdv2-draft-panel", children: [
    /* @__PURE__ */ $("div", { className: "fdv2-draft-head", children: [
      /* @__PURE__ */ E("div", { className: "fdv2-draft-title", children: a }),
      /* @__PURE__ */ $("div", { className: "fdv2-draft-headright", children: [
        /* @__PURE__ */ E("span", { className: `fdv2-status-badge fdv2-status-${r.status || "draft"}`, children: u }),
        /* @__PURE__ */ E("button", { type: "button", className: "fdv2-icon-btn fdv2-draft-collapse", onClick: s.toggleDraftPanel, title: e("draft.collapse"), "aria-label": e("draft.collapse"), children: "▾" })
      ] })
    ] }),
    o ? /* @__PURE__ */ $("div", { className: "fdv2-draft-body", children: [
      f && /* @__PURE__ */ $("div", { className: "fdv2-draft-benef", children: [
        /* @__PURE__ */ E("span", { className: "fdv2-benef-label", children: e("draft.beneficiary") }),
        /* @__PURE__ */ E("span", { className: "fdv2-benef-val", children: f.mode === "self" ? e("draft.forSelf") : f.resolvedProfile?.name || f.userId || "—" })
      ] }),
      l.length === 0 && /* @__PURE__ */ E("div", { className: "fdv2-draft-empty", children: /* @__PURE__ */ E("p", { children: e("draft.loading") }) }),
      l.map((c) => /* @__PURE__ */ $("section", { className: "fdv2-draft-group", children: [
        /* @__PURE__ */ E("h4", { className: "fdv2-draft-group-title", children: e(`phase.${c.phase}`, { defaultValue: c.phase }) }),
        c.slots.map((p) => /* @__PURE__ */ E(
          md,
          {
            slotDef: p,
            slotValue: t.slots[p.slotId],
            affectedStale: Qs(p.slotId, t.slots, n),
            onEdit: s.patchSlot
          },
          p.slotId
        ))
      ] }, c.phase))
    ] }) : /* @__PURE__ */ $("div", { className: "fdv2-draft-empty", children: [
      /* @__PURE__ */ E("p", { children: e("draft.empty") }),
      /* @__PURE__ */ E("p", { className: "fdv2-draft-empty-hint", children: e("draft.emptyHint") })
    ] })
  ] });
}
function bd({
  showDraftPanel: e,
  showLanguageSwitcher: t,
  showVoiceControls: n,
  className: r,
  serviceId: i,
  emptyState: s,
  userProfile: o
}) {
  const { t: a } = xe(), u = Ge(), l = Vi(), [f, c] = he(Ar());
  be(() => {
    const h = () => c(Ar());
    return Ce.on("languageChanged", h), () => Ce.off("languageChanged", h);
  }, []), be(() => {
    o && o.userId && u.setUser(o);
  }, [o, u]);
  const p = ae(!1);
  return be(() => {
    p.current || !i || (p.current = !0, l.serviceId !== i && (_e.getState().messages.length > 0 || u.startSession(i)));
  }, [i, l.serviceId, u]), /* @__PURE__ */ E(
    "div",
    {
      className: `fdv2-root${r ? ` ${r}` : ""}`,
      "data-feature": "altiora-chat",
      dir: f,
      children: /* @__PURE__ */ $("main", { className: "fdv2-main", children: [
        /* @__PURE__ */ $("section", { className: "fdv2-conversation", "aria-label": "Conversation", children: [
          /* @__PURE__ */ E(Xp, { emptyState: s, children: /* @__PURE__ */ E(hd, {}) }),
          /* @__PURE__ */ E(fd, { showVoiceControls: n, showLanguageSwitcher: t })
        ] }),
        e && /* @__PURE__ */ E("aside", { className: "fdv2-draft", "aria-label": a("draft.requestLabel"), children: /* @__PURE__ */ E(yd, {}) })
      ] })
    }
  );
}
function Sd({
  apiBaseUrl: e,
  userId: t,
  userProfile: n,
  getAuthHeaders: r,
  fetchImpl: i,
  eventSourceImpl: s,
  lang: o,
  serviceId: a = null,
  showDraftPanel: u = !1,
  showLanguageSwitcher: l = !0,
  showVoiceControls: f = !0,
  className: c,
  emptyState: p,
  children: h,
  onSubmitted: d,
  onError: y,
  onSessionStart: x
}) {
  ua({
    apiBaseUrl: e,
    userId: t,
    getAuthHeaders: r,
    fetchImpl: i,
    eventSourceImpl: s,
    onSubmitted: d,
    onError: y,
    onSessionStart: x
  });
  const b = ae(void 0);
  return be(() => {
    !o || b.current === o || (b.current = o, Bi(o));
  }, [o]), /* @__PURE__ */ E(Xo, { i18n: Ce, children: /* @__PURE__ */ E(
    bd,
    {
      showDraftPanel: u,
      showLanguageSwitcher: l,
      showVoiceControls: f,
      className: c,
      serviceId: a,
      emptyState: p ?? h,
      userProfile: n
    }
  ) });
}
export {
  Sd as AltioraChat,
  Z as ChatError,
  bt as LANGUAGES,
  wd as SSE_EVENTS,
  Oe as chatClient,
  ua as configureChat,
  Ar as currentDir,
  Mt as currentLang,
  Sd as default,
  ea as dirFor,
  Ue as getConfig,
  Ce as i18n,
  Bi as setLang,
  Ge as useChatActions,
  _e as useChatStore,
  xa as useDraft,
  ba as useMessages,
  ka as useSchema,
  Vi as useSession,
  it as useUI
};
//# sourceMappingURL=flowdesk-chat-v2.js.map
