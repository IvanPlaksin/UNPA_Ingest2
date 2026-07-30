import { jsxs as P, jsx as x, Fragment as Vi } from "react/jsx-runtime";
import Me, { createContext as Kn, useContext as Wn, useMemo as bt, useRef as ae, useCallback as Ce, useState as ne, useEffect as te, createElement as Hi } from "react";
import { createPortal as Gn } from "react-dom";
const j = (e) => typeof e == "string", ht = () => {
  let e, t;
  const n = new Promise((r, i) => {
    e = r, t = i;
  });
  return n.resolve = e, n.reject = t, n;
}, Sr = (e) => e == null ? "" : String(e), To = (e, t, n) => {
  e.forEach((r) => {
    t[r] && (n[r] = t[r]);
  });
}, No = /###/g, Cr = (e) => e && e.includes("###") ? e.replace(No, ".") : e, Er = (e) => !e || j(e), xt = (e, t, n) => {
  const r = j(t) ? t.split(".") : t;
  let i = 0;
  for (; i < r.length - 1; ) {
    if (Er(e)) return {};
    const s = Cr(r[i]);
    !e[s] && n && (e[s] = new n()), Object.prototype.hasOwnProperty.call(e, s) ? e = e[s] : e = {}, ++i;
  }
  return Er(e) ? {} : {
    obj: e,
    k: Cr(r[i])
  };
}, Ir = (e, t, n) => {
  const {
    obj: r,
    k: i
  } = xt(e, t, Object);
  if (r !== void 0 || t.length === 1) {
    r[i] = n;
    return;
  }
  let s = t[t.length - 1], o = t.slice(0, t.length - 1), a = xt(e, o, Object);
  for (; a.obj === void 0 && o.length; )
    s = `${o[o.length - 1]}.${s}`, o = o.slice(0, o.length - 1), a = xt(e, o, Object), a?.obj && typeof a.obj[`${a.k}.${s}`] < "u" && (a.obj = void 0);
  a.obj[`${a.k}.${s}`] = n;
}, Lo = (e, t, n, r) => {
  const {
    obj: i,
    k: s
  } = xt(e, t, Object);
  i[s] = i[s] || [], i[s].push(n);
}, $t = (e, t) => {
  const {
    obj: n,
    k: r
  } = xt(e, t);
  if (n && Object.prototype.hasOwnProperty.call(n, r))
    return n[r];
}, Ao = (e, t, n) => {
  const r = $t(e, n);
  return r !== void 0 ? r : $t(t, n);
}, Ui = (e, t, n) => {
  for (const r in t)
    r !== "__proto__" && r !== "constructor" && (Object.prototype.hasOwnProperty.call(e, r) ? j(e[r]) || e[r] instanceof String || j(t[r]) || t[r] instanceof String ? n && (e[r] = t[r]) : Ui(e[r], t[r], n) : e[r] = t[r]);
  return e;
}, Re = (e) => e.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), Ro = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;"
}, Oo = (e) => j(e) ? e.replace(/[&<>"'\/]/g, (t) => Ro[t]) : e;
class Po {
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
const _o = [" ", ",", "?", "!", ";"], Do = new Po(20), Fo = (e, t, n) => {
  t = t || "", n = n || "";
  const r = _o.filter((o) => !t.includes(o) && !n.includes(o));
  if (r.length === 0) return !0;
  const i = Do.getRegExp(`(${r.map((o) => o === "?" ? "\\?" : o).join("|")})`);
  let s = !i.test(e);
  if (!s) {
    const o = e.indexOf(n);
    o > 0 && !i.test(e.substring(0, o)) && (s = !0);
  }
  return s;
}, Ln = (e, t, n = ".") => {
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
}, Ct = (e) => e?.replace(/_/g, "-"), Mo = {
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
    this.prefix = n.prefix || "i18next:", this.logger = t || Mo, this.options = n, this.debug = n.debug;
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
    return i && !this.debug ? null : (t = t.map((s) => j(s) ? s.replace(/[\r\n\x00-\x1F\x7F]/g, " ") : s), j(t[0]) && (t[0] = `${r}${this.prefix} ${t[0]}`), this.logger[n](t));
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
var Te = new Bt();
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
class Tr extends Wt {
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
    t.includes(".") ? a = t.split(".") : (a = [t, n], r && (Array.isArray(r) ? a.push(...r) : j(r) && s ? a.push(...r.split(s)) : a.push(r)));
    const u = $t(this.data, a);
    return !u && !n && !r && t.includes(".") && (t = a[0], n = a[1], r = a.slice(2).join(".")), u || !o || !j(r) ? u : Ln(this.data?.[t]?.[n], r, s);
  }
  addResource(t, n, r, i, s = {
    silent: !1
  }) {
    const o = s.keySeparator !== void 0 ? s.keySeparator : this.options.keySeparator;
    let a = [t, n];
    r && (a = a.concat(o ? r.split(o) : r)), t.includes(".") && (a = t.split("."), i = n, n = a[1]), this.addNamespaces(n), Ir(this.data, a, i), s.silent || this.emit("added", t, n, r, i);
  }
  addResources(t, n, r, i = {
    silent: !1
  }) {
    for (const s in r)
      (j(r[s]) || Array.isArray(r[s])) && this.addResource(t, n, s, r[s], {
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
    o.skipCopy || (r = JSON.parse(JSON.stringify(r))), i ? Ui(u, r, s) : u = {
      ...u,
      ...r
    }, Ir(this.data, a, u), o.silent || this.emit("added", t, n, r);
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
var qi = {
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
const Ki = /* @__PURE__ */ Symbol("i18next/PATH_KEY");
function zo() {
  const e = [], t = /* @__PURE__ */ Object.create(null);
  let n;
  return t.get = (r, i) => (n?.revoke?.(), i === Ki ? e : (e.push(i), n = Proxy.revocable(r, t), n.proxy)), Proxy.revocable(/* @__PURE__ */ Object.create(null), t).proxy;
}
function it(e, t) {
  const {
    [Ki]: n
  } = e(zo()), r = t?.keySeparator ?? ".", i = t?.nsSeparator ?? ":", s = t?.enableSelector === "strict";
  if (n.length > 1 && i) {
    const o = t?.ns, a = s ? Array.isArray(o) ? o : o ? [o] : null : Array.isArray(o) ? o : null;
    if (a && (s ? a : a.length > 1 ? a.slice(1) : []).includes(n[0]))
      return `${n[0]}${i}${n.slice(1).join(r)}`;
  }
  return n.join(r);
}
const en = (e) => !j(e) && typeof e != "boolean" && typeof e != "number";
class Vt extends Wt {
  constructor(t, n = {}) {
    super(), To(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], t, this), this.options = n, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.logger = Te.create("translator"), this.checkedLoadedFor = {};
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
    const s = en(i.res);
    return !(r.returnObjects === !1 && s);
  }
  extractFromKey(t, n) {
    let r = n.nsSeparator !== void 0 ? n.nsSeparator : this.options.nsSeparator;
    r === void 0 && (r = ":");
    const i = n.keySeparator !== void 0 ? n.keySeparator : this.options.keySeparator;
    let s = n.ns || this.options.defaultNS || [];
    const o = r && t.includes(r), a = !this.options.userDefinedKeySeparator && !n.keySeparator && !this.options.userDefinedNsSeparator && !n.nsSeparator && !Fo(t, r, i);
    if (o && !a) {
      const u = t.match(this.interpolator.nestingRegexp);
      if (u && u.length > 0)
        return {
          key: t,
          namespaces: j(s) ? [s] : s
        };
      const l = t.split(r);
      (r !== i || r === i && this.options.ns.includes(l[0])) && (s = l.shift()), t = l.join(i);
    }
    return {
      key: t,
      namespaces: j(s) ? [s] : s
    };
  }
  translate(t, n, r) {
    let i = typeof n == "object" ? {
      ...n
    } : n;
    if (typeof i != "object" && this.options.overloadTranslationOptionHandler && (i = this.options.overloadTranslationOptionHandler(arguments)), typeof i == "object" && (i = {
      ...i
    }), i || (i = {}), t == null) return "";
    typeof t == "function" && (t = it(t, {
      ...this.options,
      ...i
    })), Array.isArray(t) || (t = [String(t)]), t = t.map((F) => typeof F == "function" ? it(F, {
      ...this.options,
      ...i
    }) : String(F));
    const s = i.returnDetails !== void 0 ? i.returnDetails : this.options.returnDetails, o = i.keySeparator !== void 0 ? i.keySeparator : this.options.keySeparator, {
      key: a,
      namespaces: u
    } = this.extractFromKey(t[t.length - 1], i), l = u[u.length - 1];
    let f = i.nsSeparator !== void 0 ? i.nsSeparator : this.options.nsSeparator;
    f === void 0 && (f = ":");
    const c = i.lng || this.language, d = i.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
    if (c?.toLowerCase() === "cimode")
      return d ? s ? {
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
    let p = h?.res;
    const g = h?.usedKey || a, k = h?.exactUsedKey || a, b = ["[object Number]", "[object Function]", "[object RegExp]"], S = i.joinArrays !== void 0 ? i.joinArrays : this.options.joinArrays, w = !this.i18nFormat || this.i18nFormat.handleAsObject, I = i.count !== void 0 && !j(i.count), R = Vt.hasDefaultValue(i), C = I ? this.pluralResolver.getSuffix(c, i.count, i) : "", z = i.ordinal && I ? this.pluralResolver.getSuffix(c, i.count, {
      ordinal: !1
    }) : "", V = I && !i.ordinal && i.count === 0, _ = V && i[`defaultValue${this.options.pluralSeparator}zero`] || i[`defaultValue${C}`] || i[`defaultValue${z}`] || i.defaultValue;
    let v = p;
    w && !p && R && (v = _);
    const N = en(v), L = Object.prototype.toString.apply(v);
    if (w && v && N && !b.includes(L) && !(j(S) && Array.isArray(v))) {
      if (!i.returnObjects && !this.options.returnObjects) {
        this.options.returnedObjectHandler || this.logger.warn("accessing an object - but returnObjects options is not enabled!");
        const F = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(g, v, {
          ...i,
          ns: u
        }) : `key '${a} (${this.language})' returned an object instead of string.`;
        return s ? (h.res = F, h.usedParams = this.getUsedParamsDetails(i), h) : F;
      }
      if (o) {
        const F = Array.isArray(v), D = F ? [] : {}, O = F ? k : g;
        for (const H in v)
          if (Object.prototype.hasOwnProperty.call(v, H)) {
            const W = `${O}${o}${H}`;
            R && !p ? D[H] = this.translate(W, {
              ...i,
              defaultValue: en(_) ? _[H] : void 0,
              joinArrays: !1,
              ns: u
            }) : D[H] = this.translate(W, {
              ...i,
              joinArrays: !1,
              ns: u
            }), D[H] === W && (D[H] = v[H]);
          }
        p = D;
      }
    } else if (w && j(S) && Array.isArray(p))
      p = p.join(S), p && (p = this.extendTranslation(p, t, i, r));
    else {
      let F = !1, D = !1;
      !this.isValidLookup(p) && R && (F = !0, p = _), this.isValidLookup(p) || (D = !0, p = a);
      const H = (i.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey) && D ? void 0 : p, W = R && _ !== p && this.options.updateMissing;
      if (D || F || W) {
        if (this.logger.log(W ? "updateKey" : "missingKey", c, l, I && !W ? `${a}${this.pluralResolver.getSuffix(c, i.count, i)}` : a, W ? _ : p), o) {
          const Z = this.resolve(a, {
            ...i,
            keySeparator: !1
          });
          Z && Z.res && this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
        }
        let ie = [];
        const he = this.languageUtils.getFallbackCodes(this.options.fallbackLng, i.lng || this.language);
        if (this.options.saveMissingTo === "fallback" && he && he[0])
          for (let Z = 0; Z < he.length; Z++)
            ie.push(he[Z]);
        else this.options.saveMissingTo === "all" ? ie = this.languageUtils.toResolveHierarchy(i.lng || this.language) : ie.push(i.lng || this.language);
        const m = (Z, se, y) => {
          const de = R && y !== p ? y : H;
          this.options.missingKeyHandler ? this.options.missingKeyHandler(Z, l, se, de, W, i) : this.backendConnector?.saveMissing && this.backendConnector.saveMissing(Z, l, se, de, W, i), this.emit("missingKey", Z, l, se, p);
        };
        this.options.saveMissing && (this.options.saveMissingPlurals && I ? ie.forEach((Z) => {
          const se = this.pluralResolver.getSuffixes(Z, i);
          V && i[`defaultValue${this.options.pluralSeparator}zero`] && !se.includes(`${this.options.pluralSeparator}zero`) && se.push(`${this.options.pluralSeparator}zero`), se.forEach((y) => {
            m([Z], a + y, i[`defaultValue${y}`] || _);
          });
        }) : m(ie, a, _));
      }
      p = this.extendTranslation(p, t, i, h, r), D && p === a && this.options.appendNamespaceToMissingKey && (p = `${l}${f}${a}`), (D || F) && this.options.parseMissingKeyHandler && (p = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${l}${f}${a}` : a, F ? p : void 0, i));
    }
    return s ? (h.res = p, h.usedParams = this.getUsedParamsDetails(i), h) : p;
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
      const u = j(t) && (r?.interpolation?.skipOnVariables !== void 0 ? r.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
      let l;
      if (u) {
        const c = t.match(this.interpolator.nestingRegexp);
        l = c && c.length;
      }
      let f = r.replace && !j(r.replace) ? r.replace : r;
      if (this.options.interpolation.defaultVariables && (f = {
        ...this.options.interpolation.defaultVariables,
        ...f
      }), t = this.interpolator.interpolate(t, f, r.lng || this.language || i.usedLng, r), u) {
        const c = t.match(this.interpolator.nestingRegexp), d = c && c.length;
        l < d && (r.nest = !1);
      }
      !r.lng && i && i.res && (r.lng = this.language || i.usedLng), r.nest !== !1 && (t = this.interpolator.nest(t, (...c) => s?.[0] === c[0] && !r.context ? (this.logger.warn(`It seems you are nesting recursively key: ${c[0]} in key: ${n[0]}`), null) : this.translate(...c, n), r)), r.interpolation && this.interpolator.reset();
    }
    const o = r.postProcess || this.options.postProcess, a = j(o) ? [o] : o;
    return t != null && a?.length && r.applyPostProcessor !== !1 && (t = qi.handle(a, t, n, this.options && this.options.postProcessPassResolved ? {
      i18nResolved: {
        ...i,
        usedParams: this.getUsedParamsDetails(r)
      },
      ...r
    } : r, this)), t;
  }
  resolve(t, n = {}) {
    let r, i, s, o, a;
    return j(t) && (t = [t]), Array.isArray(t) && (t = t.map((u) => typeof u == "function" ? it(u, {
      ...this.options,
      ...n
    }) : u)), t.forEach((u) => {
      if (this.isValidLookup(r)) return;
      const l = this.extractFromKey(u, n), f = l.key;
      i = f;
      let c = l.namespaces;
      this.options.fallbackNS && (c = c.concat(this.options.fallbackNS));
      const d = n.count !== void 0 && !j(n.count), h = d && !n.ordinal && n.count === 0, p = n.context !== void 0 && (j(n.context) || typeof n.context == "number") && n.context !== "", g = n.lngs ? n.lngs : this.languageUtils.toResolveHierarchy(n.lng || this.language, n.fallbackLng);
      c.forEach((k) => {
        this.isValidLookup(r) || (a = k, !this.checkedLoadedFor[`${g[0]}-${k}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(a) && (this.checkedLoadedFor[`${g[0]}-${k}`] = !0, this.logger.warn(`key "${i}" for languages "${g.join(", ")}" won't get resolved as namespace "${a}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!")), g.forEach((b) => {
          if (this.isValidLookup(r)) return;
          o = b;
          const S = [f];
          if (this.i18nFormat?.addLookupKeys)
            this.i18nFormat.addLookupKeys(S, f, b, k, n);
          else {
            let I;
            d && (I = this.pluralResolver.getSuffix(b, n.count, n));
            const R = `${this.options.pluralSeparator}zero`, C = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
            if (d && (n.ordinal && I.startsWith(C) && S.push(f + I.replace(C, this.options.pluralSeparator)), S.push(f + I), h && S.push(f + R)), p) {
              const z = `${f}${this.options.contextSeparator || "_"}${n.context}`;
              S.push(z), d && (n.ordinal && I.startsWith(C) && S.push(z + I.replace(C, this.options.pluralSeparator)), S.push(z + I), h && S.push(z + R));
            }
          }
          let w;
          for (; w = S.pop(); )
            this.isValidLookup(r) || (s = w, r = this.getResource(b, k, w, n));
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
    const n = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"], r = t.replace && !j(t.replace);
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
class Nr {
  constructor(t) {
    this.options = t, this.supportedLngs = this.options.supportedLngs || !1, this.logger = Te.create("languageUtils");
  }
  getScriptPartFromCode(t) {
    if (t = Ct(t), !t || !t.includes("-")) return null;
    const n = t.split("-");
    return n.length === 2 || (n.pop(), n[n.length - 1].toLowerCase() === "x") ? null : this.formatLanguageCode(n.join("-"));
  }
  getLanguagePartFromCode(t) {
    if (t = Ct(t), !t || !t.includes("-")) return t;
    const n = t.split("-");
    return this.formatLanguageCode(n[0]);
  }
  formatLanguageCode(t) {
    if (j(t) && t.includes("-")) {
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
    if (typeof t == "function" && (t = t(n)), j(t) && (t = [t]), Array.isArray(t)) return t;
    if (!n) return t.default || [];
    let r = t[n];
    return r || (r = t[this.getScriptPartFromCode(n)]), r || (r = t[this.formatLanguageCode(n)]), r || (r = t[this.getLanguagePartFromCode(n)]), r || (r = t.default), r || [];
  }
  toResolveHierarchy(t, n) {
    const r = this.getFallbackCodes((n === !1 ? [] : n) || this.options.fallbackLng || [], t), i = [], s = (o) => {
      o && (this.isSupportedCode(o) ? i.push(o) : this.logger.warn(`rejecting language code not found in supportedLngs: ${o}`));
    };
    return j(t) && (t.includes("-") || t.includes("_")) ? (this.options.load !== "languageOnly" && s(this.formatLanguageCode(t)), this.options.load !== "languageOnly" && this.options.load !== "currentOnly" && s(this.getScriptPartFromCode(t)), this.options.load !== "currentOnly" && s(this.getLanguagePartFromCode(t))) : j(t) && s(this.formatLanguageCode(t)), r.forEach((o) => {
      i.includes(o) || s(this.formatLanguageCode(o));
    }), i;
  }
}
const Lr = {
  zero: 0,
  one: 1,
  two: 2,
  few: 3,
  many: 4,
  other: 5
}, Ar = {
  select: (e) => e === 1 ? "one" : "other",
  resolvedOptions: () => ({
    pluralCategories: ["one", "other"]
  })
};
class jo {
  constructor(t, n = {}) {
    this.languageUtils = t, this.options = n, this.logger = Te.create("pluralResolver"), this.pluralRulesCache = {};
  }
  clearCache() {
    this.pluralRulesCache = {};
  }
  getRule(t, n = {}) {
    const r = Ct(t === "dev" ? "en" : t), i = n.ordinal ? "ordinal" : "cardinal", s = JSON.stringify({
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
        return this.logger.error("No Intl support, please use an Intl polyfill!"), Ar;
      if (!t.match(/-|_/)) return Ar;
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
    return r || (r = this.getRule("dev", n)), r ? r.resolvedOptions().pluralCategories.sort((i, s) => Lr[i] - Lr[s]).map((i) => `${this.options.prepend}${n.ordinal ? `ordinal${this.options.prepend}` : ""}${i}`) : [];
  }
  getSuffix(t, n, r = {}) {
    const i = this.getRule(t, r);
    return i ? `${this.options.prepend}${r.ordinal ? `ordinal${this.options.prepend}` : ""}${i.select(n)}` : (this.logger.warn(`no plural rule found for: ${t}`), this.getSuffix("dev", n, r));
  }
}
const Rr = (e, t, n, r = ".", i = !0) => {
  let s = Ao(e, t, n);
  return !s && i && j(n) && (s = Ln(e, n, r), s === void 0 && (s = Ln(t, n, r))), s;
}, $o = (e) => e.replace(/\$/g, "$$$$");
class Or {
  constructor(t = {}) {
    this.logger = Te.create("interpolator"), this.options = t, this.format = t?.interpolation?.format || ((n) => n), this.init(t);
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
      nestingPrefix: d,
      nestingPrefixEscaped: h,
      nestingSuffix: p,
      nestingSuffixEscaped: g,
      nestingOptionsSeparator: k,
      maxReplaces: b,
      alwaysFormat: S
    } = t.interpolation;
    this.escape = n !== void 0 ? n : Oo, this.escapeValue = r !== void 0 ? r : !0, this.useRawValueToEscape = i !== void 0 ? i : !1, this.prefix = s ? Re(s) : o || "{{", this.suffix = a ? Re(a) : u || "}}", this.formatSeparator = l || ",", this.unescapePrefix = f ? "" : c ? Re(c) : "-", this.unescapeSuffix = this.unescapePrefix ? "" : f ? Re(f) : "", this.nestingPrefix = d ? Re(d) : h || Re("$t("), this.nestingSuffix = p ? Re(p) : g || Re(")"), this.nestingOptionsSeparator = k || ",", this.maxReplaces = b || 1e3, this.alwaysFormat = S !== void 0 ? S : !1, this.resetRegExp();
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
        const b = Rr(n, u, h, this.options.keySeparator, this.options.ignoreJSONStructure);
        return this.alwaysFormat ? this.format(b, void 0, r, {
          ...i,
          ...n,
          interpolationkey: h
        }) : b;
      }
      const p = h.split(this.formatSeparator), g = p.shift().trim(), k = p.join(this.formatSeparator).trim();
      return this.format(Rr(n, u, g, this.options.keySeparator, this.options.ignoreJSONStructure), k, r, {
        ...i,
        ...n,
        interpolationkey: g
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
        const p = s[1].trim();
        if (o = l(p), o === void 0)
          if (typeof f == "function") {
            const k = f(t, s, i);
            o = j(k) ? k : "";
          } else if (i && Object.prototype.hasOwnProperty.call(i, p))
            o = "";
          else if (c) {
            o = s[0];
            continue;
          } else
            this.logger.warn(`missed to pass in variable ${p} for interpolating ${t}`), o = "";
        else !j(o) && !this.useRawValueToEscape && (o = Sr(o));
        const g = h.safeValue(o);
        if (t = t.replace(s[0], $o(g)), c ? (h.regex.lastIndex += g.length, h.regex.lastIndex -= s[0].length) : h.regex.lastIndex = 0, a++, a >= this.maxReplaces)
          break;
      }
    }), t;
  }
  nest(t, n, r = {}) {
    let i, s, o;
    const a = (u, l) => {
      const f = this.nestingOptionsSeparator;
      if (!u.includes(f)) return u;
      const c = u.split(new RegExp(`${Re(f)}[ ]*{`));
      let d = `{${c[1]}`;
      u = c[0], d = this.interpolate(d, o);
      const h = d.match(/'/g), p = d.match(/"/g);
      ((h?.length ?? 0) % 2 === 0 && !p || (p?.length ?? 0) % 2 !== 0) && (d = d.replace(/'/g, '"'));
      try {
        o = JSON.parse(d), l && (o = {
          ...l,
          ...o
        });
      } catch (g) {
        return this.logger.warn(`failed parsing options string in nesting for key ${u}`, g), `${u}${f}${d}`;
      }
      return o.defaultValue && o.defaultValue.includes(this.prefix) && delete o.defaultValue, u;
    };
    for (; i = this.nestingRegexp.exec(t); ) {
      let u = [];
      o = {
        ...r
      }, o = o.replace && !j(o.replace) ? o.replace : o, o.applyPostProcessor = !1, delete o.defaultValue;
      const l = /{.*}/s.test(i[1]) ? i[1].lastIndexOf("}") + 1 : i[1].indexOf(this.formatSeparator);
      if (l !== -1 && (u = i[1].slice(l).split(this.formatSeparator).map((f) => f.trim()).filter(Boolean), i[1] = i[1].slice(0, l)), s = n(a.call(this, i[1].trim(), o), o), s && i[0] === t && !j(s)) return s;
      j(s) || (s = Sr(s)), s || (this.logger.warn(`missed to resolve ${i[1]} for nesting ${t}`), s = ""), u.length && (s = u.reduce((f, c) => this.format(f, c, r.lng, {
        ...r,
        interpolationkey: i[1].trim()
      }), s.trim())), t = t.replace(i[0], s), this.regexp.lastIndex = 0;
    }
    return t;
  }
}
const Bo = (e) => {
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
}, Pr = (e) => {
  const t = {};
  return (n, r, i) => {
    let s = i;
    i && i.interpolationkey && i.formatParams && i.formatParams[i.interpolationkey] && i[i.interpolationkey] && (s = {
      ...s,
      [i.interpolationkey]: void 0
    });
    const o = r + JSON.stringify(s);
    let a = t[o];
    return a || (a = e(Ct(r), i), t[o] = a), a(n);
  };
}, Vo = (e) => (t, n, r) => e(Ct(n), r)(t);
class Ho {
  constructor(t = {}) {
    this.logger = Te.create("formatter"), this.options = t, this.init(t);
  }
  init(t, n = {
    interpolation: {}
  }) {
    this.formatSeparator = n.interpolation.formatSeparator || ",";
    const r = n.cacheInBuiltFormats ? Pr : Vo;
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
    this.formats[t.toLowerCase().trim()] = Pr(n);
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
      } = Bo(l);
      if (this.formats[f]) {
        let d = u;
        try {
          const h = i?.formatParams?.[i.interpolationkey] || {}, p = h.locale || h.lng || i.locale || i.lng || r;
          d = this.formats[f](u, p, {
            ...c,
            ...i,
            ...h
          });
        } catch (h) {
          this.logger.warn(h);
        }
        return d;
      } else
        this.logger.warn(`there was no format function for ${f}`);
      return u;
    }, t);
  }
}
const Uo = (e, t) => {
  e.pending[t] !== void 0 && (delete e.pending[t], e.pendingCount--);
};
class qo extends Wt {
  constructor(t, n, r, i = {}) {
    super(), this.backend = t, this.store = n, this.services = r, this.languageUtils = r.languageUtils, this.options = i, this.logger = Te.create("backendConnector"), this.waitingReads = [], this.maxParallelReads = i.maxParallelReads || 10, this.readingCalls = 0, this.maxRetries = i.maxRetries >= 0 ? i.maxRetries : 5, this.retryTimeout = i.retryTimeout >= 1 ? i.retryTimeout : 350, this.state = {}, this.queue = [], this.backend?.init?.(r, i.backend, i);
  }
  queueLoad(t, n, r, i) {
    const s = {}, o = {}, a = {}, u = {};
    return t.forEach((l) => {
      let f = !0;
      n.forEach((c) => {
        const d = `${l}|${c}`;
        !r.reload && this.store.hasResourceBundle(l, c) ? this.state[d] = 2 : this.state[d] < 0 || (this.state[d] === 1 ? o[d] === void 0 && (o[d] = !0) : (this.state[d] = 1, f = !1, o[d] === void 0 && (o[d] = !0), s[d] === void 0 && (s[d] = !0), u[c] === void 0 && (u[c] = !0)));
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
      Lo(u.loaded, [s], o), Uo(u, t), n && u.errors.push(n), u.pendingCount === 0 && !u.done && (Object.keys(u.loaded).forEach((l) => {
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
    j(t) && (t = this.languageUtils.toResolveHierarchy(t)), j(n) && (n = [n]);
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
const tn = () => ({
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
    if (typeof e[1] == "object" && (t = e[1]), j(e[1]) && (t.defaultValue = e[1]), j(e[2]) && (t.tDescription = e[2]), typeof e[2] == "object" || typeof e[3] == "object") {
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
}), _r = (e) => (j(e.ns) && (e.ns = [e.ns]), j(e.fallbackLng) && (e.fallbackLng = [e.fallbackLng]), j(e.fallbackNS) && (e.fallbackNS = [e.fallbackNS]), e.supportedLngs && !e.supportedLngs.includes("cimode") && (e.supportedLngs = e.supportedLngs.concat(["cimode"])), e), Rt = () => {
}, Ko = (e) => {
  Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach((n) => {
    typeof e[n] == "function" && (e[n] = e[n].bind(e));
  });
};
class kt extends Wt {
  constructor(t = {}, n) {
    if (super(), this.options = _r(t), this.services = {}, this.logger = Te, this.modules = {
      external: []
    }, Ko(this), n && !this.isInitialized && !t.isClone) {
      if (!this.options.initAsync)
        return this.init(t, n), this;
      setTimeout(() => {
        this.init(t, n);
      }, 0);
    }
  }
  init(t = {}, n) {
    this.isInitializing = !0, typeof t == "function" && (n = t, t = {}), t.defaultNS == null && t.ns && (j(t.ns) ? t.defaultNS = t.ns : t.ns.includes("translation") || (t.defaultNS = t.ns[0]));
    const r = tn();
    this.options = {
      ...r,
      ...this.options,
      ..._r(t)
    }, this.options.interpolation = {
      ...r.interpolation,
      ...this.options.interpolation
    }, t.keySeparator !== void 0 && (this.options.userDefinedKeySeparator = t.keySeparator), t.nsSeparator !== void 0 && (this.options.userDefinedNsSeparator = t.nsSeparator), typeof this.options.overloadTranslationOptionHandler != "function" && (this.options.overloadTranslationOptionHandler = r.overloadTranslationOptionHandler);
    const i = (l) => l ? typeof l == "function" ? new l() : l : null;
    if (!this.options.isClone) {
      this.modules.logger ? Te.init(i(this.modules.logger), this.options) : Te.init(null, this.options);
      let l;
      this.modules.formatter ? l = this.modules.formatter : l = Ho;
      const f = new Nr(this.options);
      this.store = new Tr(this.options.resources, this.options);
      const c = this.services;
      c.logger = Te, c.resourceStore = this.store, c.languageUtils = f, c.pluralResolver = new jo(f, {
        prepend: this.options.pluralSeparator
      }), l && (c.formatter = i(l), c.formatter.init && c.formatter.init(c, this.options), this.options.interpolation.format = c.formatter.format.bind(c.formatter)), c.interpolator = new Or(this.options), c.utils = {
        hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
      }, c.backendConnector = new qo(i(this.modules.backend), c.resourceStore, c, this.options), c.backendConnector.on("*", (d, ...h) => {
        this.emit(d, ...h);
      }), this.modules.languageDetector && (c.languageDetector = i(this.modules.languageDetector), c.languageDetector.init && c.languageDetector.init(c, this.options.detection, this.options)), this.modules.i18nFormat && (c.i18nFormat = i(this.modules.i18nFormat), c.i18nFormat.init && c.i18nFormat.init(this)), this.translator = new Vt(this.services, this.options), this.translator.on("*", (d, ...h) => {
        this.emit(d, ...h);
      }), this.modules.external.forEach((d) => {
        d.init && d.init(this);
      });
    }
    if (this.format = this.options.interpolation.format, n || (n = Rt), this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
      const l = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
      l.length > 0 && l[0] !== "dev" && (this.options.lng = l[0]);
    }
    !this.services.languageDetector && !this.options.lng && this.logger.warn("init: no languageDetector is used and no lng is defined"), ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"].forEach((l) => {
      this[l] = (...f) => this.store[l](...f);
    }), ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"].forEach((l) => {
      this[l] = (...f) => (this.store[l](...f), this);
    });
    const a = ht(), u = () => {
      const l = (f, c) => {
        this.isInitializing = !1, this.isInitialized && !this.initializedStoreOnce && this.logger.warn("init: i18next is already initialized. You should call init just once!"), this.isInitialized = !0, this.options.isClone || this.logger.log("initialized", this.options), this.emit("initialized", this.options), a.resolve(c), n(f, c);
      };
      if ((this.languages || this.isLanguageChangingTo) && !this.isInitialized) return l(null, this.t.bind(this));
      this.changeLanguage(this.options.lng, l);
    };
    return this.options.resources || !this.options.initAsync ? u() : setTimeout(u, 0), a;
  }
  loadResources(t, n = Rt) {
    let r = n;
    const i = j(t) ? t : this.language;
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
    const i = ht();
    return typeof t == "function" && (r = t, t = void 0), typeof n == "function" && (r = n, n = void 0), t || (t = this.languages), n || (n = this.options.ns), r || (r = Rt), this.services.backendConnector.reload(t, n, (s) => {
      i.resolve(), r(s);
    }), i;
  }
  use(t) {
    if (!t) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
    if (!t.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
    return t.type === "backend" && (this.modules.backend = t), (t.type === "logger" || t.log && t.warn && t.error) && (this.modules.logger = t), t.type === "languageDetector" && (this.modules.languageDetector = t), t.type === "i18nFormat" && (this.modules.i18nFormat = t), t.type === "postProcessor" && qi.addPostProcessor(t), t.type === "formatter" && (this.modules.formatter = t), t.type === "3rdParty" && this.modules.external.push(t), this;
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
    const r = ht();
    this.emit("languageChanging", t);
    const i = (a) => {
      this.language = a, this.languages = this.services.languageUtils.toResolveHierarchy(a), this.resolvedLanguage = void 0, this.setResolvedLanguage(a);
    }, s = (a, u) => {
      u ? this.isLanguageChangingTo === t && (i(u), this.translator.changeLanguage(u), this.isLanguageChangingTo = void 0, this.emit("languageChanged", u), this.logger.log("languageChanged", u)) : this.isLanguageChangingTo = void 0, r.resolve((...l) => this.t(...l)), n && n(a, (...l) => this.t(...l));
    }, o = (a) => {
      !t && !a && this.services.languageDetector && (a = []);
      const u = j(a) ? a : a && a[0], l = this.store.hasLanguageSomeTranslations(u) ? u : this.services.languageUtils.getBestMatchFromCodes(j(a) ? [a] : a);
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
      const d = {
        ...this.options,
        ...f
      };
      Array.isArray(s) && !c && (d.ns = s), typeof f.keyPrefix == "function" && (f.keyPrefix = it(f.keyPrefix, d));
      const h = this.options.keySeparator || ".";
      let p;
      return f.keyPrefix && Array.isArray(a) ? p = a.map((g) => (typeof g == "function" && (g = it(g, d)), `${f.keyPrefix}${h}${g}`)) : (typeof a == "function" && (a = it(a, d)), p = f.keyPrefix ? `${f.keyPrefix}${h}${a}` : a), this.t(p, f);
    };
    return j(t) ? o.lng = t : o.lngs = t, o.ns = n, o.keyPrefix = r, o;
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
    const r = ht();
    return this.options.ns ? (j(t) && (t = [t]), t.forEach((i) => {
      this.options.ns.includes(i) || this.options.ns.push(i);
    }), this.loadResources((i) => {
      r.resolve(), n && n(i);
    }), r) : (n && n(), Promise.resolve());
  }
  loadLanguages(t, n) {
    const r = ht();
    j(t) && (t = [t]);
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
    const n = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"], r = this.services?.languageUtils || new Nr(tn());
    return t.toLowerCase().indexOf("-latn") > 1 ? "ltr" : n.includes(r.getLanguagePartFromCode(t)) || t.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
  }
  static createInstance(t = {}, n) {
    const r = new kt(t, n);
    return r.createInstance = kt.createInstance, r;
  }
  cloneInstance(t = {}, n = Rt) {
    const r = t.forkResourceStore;
    r && delete t.forkResourceStore;
    const i = {
      ...this.options,
      ...t,
      isClone: !0
    }, s = new kt(i);
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
      s.store = new Tr(a, i), s.services.resourceStore = s.store;
    }
    if (t.interpolation) {
      const u = {
        ...tn().interpolation,
        ...this.options.interpolation,
        ...t.interpolation
      }, l = {
        ...i,
        interpolation: u
      };
      s.services.interpolator = new Or(l);
    }
    return s.translator = new Vt(s.services, i), s.translator.on("*", (a, ...u) => {
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
const fe = kt.createInstance();
fe.createInstance;
fe.dir;
fe.init;
fe.loadResources;
fe.reloadResources;
fe.use;
fe.changeLanguage;
fe.getFixedT;
fe.t;
fe.exists;
fe.setDefaultNamespace;
fe.hasLoadedNamespace;
fe.loadNamespaces;
fe.loadLanguages;
function Wi(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
const Wo = (e, t, n, r) => {
  const i = [n, {
    code: t,
    ...r || {}
  }];
  if (e?.services?.logger?.forward)
    return e.services.logger.forward(i, "warn", "react-i18next::", !0);
  qe(i[0]) && (i[0] = `react-i18next:: ${i[0]}`), e?.services?.logger?.warn ? e.services.logger.warn(...i) : console?.warn && console.warn(...i);
}, Dr = {}, Mt = (e, t, n, r) => {
  qe(n) && Dr[n] || (qe(n) && (Dr[n] = /* @__PURE__ */ new Date()), Wo(e, t, n, r));
}, Gi = (e, t) => () => {
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
}, An = (e, t, n) => {
  e.loadNamespaces(t, Gi(e, n));
}, Fr = (e, t, n, r) => {
  if (qe(n) && (n = [n]), e.options.preload && e.options.preload.indexOf(t) > -1) return An(e, n, r);
  n.forEach((i) => {
    e.options.ns.indexOf(i) < 0 && e.options.ns.push(i);
  }), e.loadLanguages(t, Gi(e, r));
}, Go = (e, t, n = {}) => !t.languages || !t.languages.length ? (Mt(t, "NO_LANGUAGES", "i18n.languages were undefined or empty", {
  languages: t.languages
}), !0) : t.hasLoadedNamespace(e, {
  lng: n.lng,
  precheck: (r, i) => {
    if (n.bindI18n && n.bindI18n.indexOf("languageChanging") > -1 && r.services.backendConnector.backend && r.isLanguageChangingTo && !i(r.isLanguageChangingTo, e)) return !1;
  }
}), qe = (e) => typeof e == "string", Jo = (e) => typeof e == "object" && e !== null, Yo = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g, Qo = {
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
}, Xo = (e) => Qo[e], Zo = (e) => e.replace(Yo, Xo);
let Rn = {
  bindI18n: "languageChanged",
  bindI18nStore: "",
  transEmptyNodeValue: "",
  transSupportBasicHtmlNodes: !0,
  transWrapTextNodes: "",
  transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p"],
  useSuspense: !0,
  unescape: Zo,
  transDefaultProps: void 0
};
const ea = (e = {}) => {
  Rn = {
    ...Rn,
    ...e
  };
}, ta = () => Rn;
let Ji;
const na = (e) => {
  Ji = e;
}, ra = () => Ji, ia = {
  type: "3rdParty",
  init(e) {
    ea(e.options.react), na(e);
  }
}, Yi = Kn();
class sa {
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
var Ot = { exports: {} }, nn = {};
var Mr;
function oa() {
  if (Mr) return nn;
  Mr = 1;
  var e = Me;
  function t(c, d) {
    return c === d && (c !== 0 || 1 / c === 1 / d) || c !== c && d !== d;
  }
  var n = typeof Object.is == "function" ? Object.is : t, r = e.useState, i = e.useEffect, s = e.useLayoutEffect, o = e.useDebugValue;
  function a(c, d) {
    var h = d(), p = r({ inst: { value: h, getSnapshot: d } }), g = p[0].inst, k = p[1];
    return s(
      function() {
        g.value = h, g.getSnapshot = d, u(g) && k({ inst: g });
      },
      [c, h, d]
    ), i(
      function() {
        return u(g) && k({ inst: g }), c(function() {
          u(g) && k({ inst: g });
        });
      },
      [c]
    ), o(h), h;
  }
  function u(c) {
    var d = c.getSnapshot;
    c = c.value;
    try {
      var h = d();
      return !n(c, h);
    } catch {
      return !0;
    }
  }
  function l(c, d) {
    return d();
  }
  var f = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? l : a;
  return nn.useSyncExternalStore = e.useSyncExternalStore !== void 0 ? e.useSyncExternalStore : f, nn;
}
var rn = {};
var zr;
function aa() {
  return zr || (zr = 1, process.env.NODE_ENV !== "production" && (function() {
    function e(h, p) {
      return h === p && (h !== 0 || 1 / h === 1 / p) || h !== h && p !== p;
    }
    function t(h, p) {
      f || i.startTransition === void 0 || (f = !0, console.error(
        "You are using an outdated, pre-release alpha of React 18 that does not support useSyncExternalStore. The use-sync-external-store shim will not work correctly. Upgrade to a newer pre-release."
      ));
      var g = p();
      if (!c) {
        var k = p();
        s(g, k) || (console.error(
          "The result of getSnapshot should be cached to avoid an infinite loop"
        ), c = !0);
      }
      k = o({
        inst: { value: g, getSnapshot: p }
      });
      var b = k[0].inst, S = k[1];
      return u(
        function() {
          b.value = g, b.getSnapshot = p, n(b) && S({ inst: b });
        },
        [h, g, p]
      ), a(
        function() {
          return n(b) && S({ inst: b }), h(function() {
            n(b) && S({ inst: b });
          });
        },
        [h]
      ), l(g), g;
    }
    function n(h) {
      var p = h.getSnapshot;
      h = h.value;
      try {
        var g = p();
        return !s(h, g);
      } catch {
        return !0;
      }
    }
    function r(h, p) {
      return p();
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    var i = Me, s = typeof Object.is == "function" ? Object.is : e, o = i.useState, a = i.useEffect, u = i.useLayoutEffect, l = i.useDebugValue, f = !1, c = !1, d = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? r : t;
    rn.useSyncExternalStore = i.useSyncExternalStore !== void 0 ? i.useSyncExternalStore : d, typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })()), rn;
}
var jr;
function la() {
  return jr || (jr = 1, process.env.NODE_ENV === "production" ? Ot.exports = oa() : Ot.exports = aa()), Ot.exports;
}
var ua = la();
const ca = (e, t) => {
  if (qe(t)) return t;
  if (Jo(t) && qe(t.defaultValue)) return t.defaultValue;
  if (typeof e == "function") return "";
  if (Array.isArray(e)) {
    const n = e[e.length - 1];
    return typeof n == "function" ? "" : n;
  }
  return e;
}, fa = {
  t: ca,
  ready: !1
}, ha = () => () => {
}, ee = (e, t = {}) => {
  const {
    i18n: n
  } = t, {
    i18n: r,
    defaultNS: i
  } = Wn(Yi) || {}, s = n || r || ra();
  s && !s.reportNamespaces && (s.reportNamespaces = new sa()), s || Mt(s, "NO_I18NEXT_INSTANCE", "useTranslation: You will need to pass in an i18next instance by using initReactI18next or by passing it via props or context. In monorepo setups, make sure there is only one instance of react-i18next.");
  const o = bt(() => ({
    ...ta(),
    ...s?.options?.react,
    ...t
  }), [s, t]), {
    useSuspense: a,
    keyPrefix: u
  } = o, l = i || s?.options?.defaultNS, f = qe(l) ? [l] : l || ["translation"], c = bt(() => f, f);
  s?.reportNamespaces?.addUsedNamespaces?.(c);
  const d = ae(0), h = Ce((_) => {
    if (!s) return ha;
    const {
      bindI18n: v,
      bindI18nStore: N
    } = o, L = () => {
      d.current += 1, _();
    };
    return v && s.on(v, L), N && s.store.on(N, L), () => {
      v && v.split(" ").forEach((F) => s.off(F, L)), N && N.split(" ").forEach((F) => s.store.off(F, L));
    };
  }, [s, o]), p = ae(), g = Ce(() => {
    if (!s)
      return fa;
    const _ = !!(s.isInitialized || s.initializedStoreOnce) && c.every((O) => Go(O, s, o)), v = t.lng || s.language, N = d.current, L = p.current;
    if (L && L.ready === _ && L.lng === v && L.keyPrefix === u && L.revision === N)
      return L;
    const D = {
      t: s.getFixedT(v, o.nsMode === "fallback" ? c : c[0], u, {
        scopeNs: c
      }),
      ready: _,
      lng: v,
      keyPrefix: u,
      revision: N
    };
    return p.current = D, D;
  }, [s, c, u, o, t.lng]), [k, b] = ne(0), {
    t: S,
    ready: w
  } = ua.useSyncExternalStore(h, g, g);
  te(() => {
    if (s && !w && !a) {
      const _ = () => b((v) => v + 1);
      t.lng ? Fr(s, t.lng, c, _) : An(s, c, _);
    }
  }, [s, t.lng, c, w, a, k]);
  const I = s || {}, R = ae(null), C = ae(), z = (_) => {
    const v = Object.getOwnPropertyDescriptors(_);
    v.__original && delete v.__original;
    const N = Object.create(Object.getPrototypeOf(_), v);
    if (!Object.prototype.hasOwnProperty.call(N, "__original"))
      try {
        Object.defineProperty(N, "__original", {
          value: _,
          writable: !1,
          enumerable: !1,
          configurable: !1
        });
      } catch {
      }
    return N;
  }, V = bt(() => {
    const _ = I, v = _?.language;
    let N = _;
    _ && (R.current && R.current.__original === _ ? C.current !== v ? (N = z(_), R.current = N, C.current = v) : N = R.current : (N = z(_), R.current = N, C.current = v));
    const L = !w && !a ? (...D) => (Mt(s, "USE_T_BEFORE_READY", "useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t."), S(...D)) : S, F = [L, N, w];
    return F.t = L, F.i18n = N, F.ready = w, F;
  }, [S, I, w, I.resolvedLanguage, I.language, I.languages]);
  if (s && a && !w) {
    let _ = !1;
    try {
      _ = process.env.NODE_ENV !== "production";
    } catch {
    }
    throw _ && Mt(s, "SUSPENDED_WHILE_LOADING", "useTranslation: suspended while translations are loading (useSuspense is true by default). Add a <Suspense> boundary above this component, or set react.useSuspense: false in the i18next init options. https://react.i18next.com/latest/usetranslation-hook"), new Promise((v) => {
      const N = () => v();
      t.lng ? Fr(s, t.lng, c, N) : An(s, c, N);
    });
  }
  return V;
};
function Qi({
  i18n: e,
  defaultNS: t,
  children: n
}) {
  const r = bt(() => ({
    i18n: e,
    defaultNS: t
  }), [e, t]);
  return Hi(Yi.Provider, {
    value: r
  }, n);
}
const Jn = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ru", label: "Русский", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" }
], da = {
  en: { translation: {
    appTitle: "FlowDesk Assistant",
    reset: "Start over",
    resetConfirm: "Start over? The current conversation and draft will be cleared.",
    emptyTitle: "How can I help?",
    emptySub: "Describe what you need — I will find the service and raise the request.",
    greeting: "Hello, {{name}}! How can I help you today?",
    thanks: "Your request has been created — I was glad to help. Reach out any time you need another request.",
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
    date: { set: "Set date" },
    multichoice: { confirm: "Confirm selection", clear: "Clear" },
    freeInput: { submit: "Submit" },
    toggle: { on: "Yes", off: "No" },
    cascade: { accept: "Yes, that is correct", edit: "Enter manually" },
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
    settings: { title: "AI Settings", open: "AI Settings", close: "Close", language: "Language", languageHint: "Used for AI responses and for voice and text recognition. Auto-detection is off.", voice: "Assistant voice", voiceDefault: "Default", voiceHint: "Voice used for the AI assistant’s spoken replies." },
    sources: { view: "View sources", title: "Sources", collection: "Collection", relevance: "Relevance", close: "Close" },
    review: { title: "Review your request", edit: "Edit", editField: "Edit {{field}}", editEcho: "Edit {{field}}" },
    explain: { trigger: "Explain {{title}}", triggerTooltip: "Get help with this" },
    navigate: { goThere: "Go there", goTo: "Navigate to {{path}}" },
    floatingChat: { defaultTitle: "Help", close: "Close" },
    stopped: "Request stopped."
  } },
  ru: { translation: {
    appTitle: "FlowDesk Ассистент",
    reset: "Начать заново",
    resetConfirm: "Начать заново? Текущий диалог и черновик будут очищены.",
    emptyTitle: "Чем могу помочь?",
    emptySub: "Опишите, что вам нужно — я подберу услугу и оформлю заявку.",
    greeting: "Здравствуйте, {{name}}! Чем могу помочь?",
    thanks: "Ваша заявка создана — рад был помочь. Обращайтесь, когда понадобится оформить ещё одну заявку.",
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
    date: { set: "Указать дату" },
    multichoice: { confirm: "Подтвердить выбор", clear: "Очистить" },
    freeInput: { submit: "Отправить" },
    toggle: { on: "Да", off: "Нет" },
    cascade: { accept: "Да, всё верно", edit: "Ввести вручную" },
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
    settings: { title: "Настройки ИИ", open: "Настройки ИИ", close: "Закрыть", language: "Язык", languageHint: "Используется для ответов ИИ и распознавания голоса и текста. Автоопределение отключено.", voice: "Голос ассистента", voiceDefault: "По умолчанию", voiceHint: "Голос для устных ответов ассистента." },
    sources: { view: "Показать источники", title: "Источники", collection: "Коллекция", relevance: "Релевантность", close: "Закрыть" },
    review: { title: "Проверьте заявку", edit: "Изменить", editField: "Изменить «{{field}}»", editEcho: "Изменить «{{field}}»" },
    explain: { trigger: "Пояснить: {{title}}", triggerTooltip: "Получить помощь по этому" },
    navigate: { goThere: "Перейти", goTo: "Перейти к {{path}}" },
    floatingChat: { defaultTitle: "Помощь", close: "Закрыть" },
    stopped: "Запрос остановлен."
  } },
  fr: { translation: {
    appTitle: "Assistant FlowDesk",
    reset: "Recommencer",
    resetConfirm: "Recommencer ? La conversation et le brouillon actuels seront effacés.",
    emptyTitle: "Comment puis-je aider ?",
    emptySub: "Décrivez ce dont vous avez besoin — je trouverai le service et créerai la demande.",
    greeting: "Bonjour, {{name}} ! Comment puis-je vous aider aujourd’hui ?",
    thanks: "Votre demande a été créée — j’ai été ravi de vous aider. N’hésitez pas pour une prochaine demande.",
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
    date: { set: "Définir la date" },
    multichoice: { confirm: "Confirmer la sélection", clear: "Effacer" },
    freeInput: { submit: "Envoyer" },
    toggle: { on: "Oui", off: "Non" },
    cascade: { accept: "Oui, correct", edit: "Saisir manuellement" },
    draft: { title: "Demande", empty: "Aucun service sélectionné.", emptyHint: "Décrivez votre demande dans le chat.", beneficiary: "Bénéficiaire", forSelf: "pour moi", loading: "Chargement…", collapse: "Réduire", expand: "Afficher", requestLabel: "Brouillon" },
    phase: { context: "Contexte", routing: "Routage", detail: "Détails" },
    status: { draft: "brouillon", confirmed: "confirmation", submitted: "créée", escalated: "escalade" },
    time: { justNow: "à l'instant", minutesAgo: "il y a {{count}} min" },
    meta: { details: "détails ({{count}})" },
    slot: { required: "Obligatoire", edit: "Modifier", stale: "À reconfirmer" },
    liveChat: "Chat en direct",
    newChat: "Nouveau chat",
    language: "Langue",
    settings: { title: "Paramètres IA", open: "Paramètres IA", close: "Fermer", language: "Langue", languageHint: "Utilisée pour les réponses de l’IA et la reconnaissance vocale et textuelle. La détection automatique est désactivée.", voice: "Voix de l’assistant", voiceDefault: "Par défaut", voiceHint: "Voix des réponses orales de l’assistant." },
    sources: { view: "Voir les sources", title: "Sources", collection: "Collection", relevance: "Pertinence", close: "Fermer" },
    review: { title: "Vérifiez votre demande", edit: "Modifier", editField: "Modifier « {{field}} »", editEcho: "Modifier « {{field}} »" },
    explain: { trigger: "Expliquer : {{title}}", triggerTooltip: "Obtenir de l’aide sur cet élément" },
    navigate: { goThere: "Y aller", goTo: "Aller à {{path}}" },
    floatingChat: { defaultTitle: "Aide", close: "Fermer" },
    stopped: "Demande arrêtée."
  } },
  es: { translation: {
    appTitle: "Asistente FlowDesk",
    reset: "Empezar de nuevo",
    resetConfirm: "¿Empezar de nuevo? Se borrará la conversación y el borrador actuales.",
    emptyTitle: "¿En qué puedo ayudar?",
    emptySub: "Describa lo que necesita — encontraré el servicio y crearé la solicitud.",
    greeting: "¡Hola, {{name}}! ¿En qué puedo ayudarle hoy?",
    thanks: "Su solicitud ha sido creada — encantado de ayudar. Cuente conmigo para la próxima solicitud.",
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
    date: { set: "Establecer fecha" },
    multichoice: { confirm: "Confirmar selección", clear: "Borrar" },
    freeInput: { submit: "Enviar" },
    toggle: { on: "Sí", off: "No" },
    cascade: { accept: "Sí, correcto", edit: "Introducir manualmente" },
    draft: { title: "Solicitud", empty: "Ningún servicio seleccionado.", emptyHint: "Describa su solicitud en el chat.", beneficiary: "Beneficiario", forSelf: "para mí", loading: "Cargando…", collapse: "Contraer", expand: "Mostrar", requestLabel: "Borrador" },
    phase: { context: "Contexto", routing: "Enrutamiento", detail: "Detalles" },
    status: { draft: "borrador", confirmed: "confirmando", submitted: "creada", escalated: "escalada" },
    time: { justNow: "ahora mismo", minutesAgo: "hace {{count}} min" },
    meta: { details: "detalles ({{count}})" },
    slot: { required: "Obligatorio", edit: "Editar", stale: "Requiere reconfirmación" },
    liveChat: "Chat en vivo",
    newChat: "Nuevo chat",
    language: "Idioma",
    settings: { title: "Ajustes de IA", open: "Ajustes de IA", close: "Cerrar", language: "Idioma", languageHint: "Se usa para las respuestas de la IA y el reconocimiento de voz y texto. La detección automática está desactivada.", voice: "Voz del asistente", voiceDefault: "Predeterminada", voiceHint: "Voz de las respuestas habladas del asistente." },
    sources: { view: "Ver fuentes", title: "Fuentes", collection: "Colección", relevance: "Relevancia", close: "Cerrar" },
    review: { title: "Revise su solicitud", edit: "Editar", editField: "Editar «{{field}}»", editEcho: "Editar «{{field}}»" },
    explain: { trigger: "Explicar: {{title}}", triggerTooltip: "Obtener ayuda sobre esto" },
    navigate: { goThere: "Ir allí", goTo: "Ir a {{path}}" },
    floatingChat: { defaultTitle: "Ayuda", close: "Cerrar" },
    stopped: "Solicitud detenida."
  } },
  ar: { translation: {
    appTitle: "مساعد FlowDesk",
    reset: "البدء من جديد",
    resetConfirm: "البدء من جديد؟ سيتم مسح المحادثة والمسودة الحاليتين.",
    emptyTitle: "كيف يمكنني المساعدة؟",
    emptySub: "صف ما تحتاجه — سأجد الخدمة وأنشئ الطلب.",
    greeting: "مرحبًا، {{name}}! كيف يمكنني مساعدتك اليوم؟",
    thanks: "تم إنشاء طلبك — سعدت بمساعدتك. تواصل معي في أي وقت لطلب آخر.",
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
    date: { set: "تحديد التاريخ" },
    multichoice: { confirm: "تأكيد الاختيار", clear: "مسح" },
    freeInput: { submit: "إرسال" },
    toggle: { on: "نعم", off: "لا" },
    cascade: { accept: "نعم، صحيح", edit: "إدخال يدوي" },
    draft: { title: "طلب", empty: "لم يتم اختيار خدمة.", emptyHint: "صف طلبك في المحادثة.", beneficiary: "المستفيد", forSelf: "لي", loading: "جارٍ التحميل…", collapse: "طيّ", expand: "عرض", requestLabel: "مسودة" },
    phase: { context: "السياق", routing: "التوجيه", detail: "التفاصيل" },
    status: { draft: "مسودة", confirmed: "قيد التأكيد", submitted: "تم الإنشاء", escalated: "تصعيد" },
    time: { justNow: "الآن", minutesAgo: "قبل {{count}} دقيقة" },
    meta: { details: "تفاصيل ({{count}})" },
    slot: { required: "مطلوب", edit: "تعديل", stale: "يحتاج إعادة تأكيد" },
    liveChat: "دردشة مباشرة",
    newChat: "محادثة جديدة",
    language: "اللغة",
    settings: { title: "إعدادات الذكاء الاصطناعي", open: "إعدادات الذكاء الاصطناعي", close: "إغلاق", language: "اللغة", languageHint: "تُستخدم لردود الذكاء الاصطناعي وللتعرف على الصوت والنص. الكشف التلقائي معطّل.", voice: "صوت المساعد", voiceDefault: "افتراضي", voiceHint: "الصوت المستخدم لردود المساعد المنطوقة." },
    sources: { view: "عرض المصادر", title: "المصادر", collection: "المجموعة", relevance: "الصلة", close: "إغلاق" },
    review: { title: "راجع طلبك", edit: "تعديل", editField: "تعديل «{{field}}»", editEcho: "تعديل «{{field}}»" },
    explain: { trigger: "شرح: {{title}}", triggerTooltip: "احصل على مساعدة بشأن هذا" },
    navigate: { goThere: "الذهاب إلى هناك", goTo: "الانتقال إلى {{path}}" },
    floatingChat: { defaultTitle: "مساعدة", close: "إغلاق" },
    stopped: "تم إيقاف الطلب."
  } },
  zh: { translation: {
    appTitle: "FlowDesk 助手",
    reset: "重新开始",
    resetConfirm: "重新开始？当前对话和草稿将被清除。",
    emptyTitle: "有什么可以帮您？",
    emptySub: "描述您的需求——我会找到相应服务并创建请求。",
    greeting: "您好，{{name}}！今天有什么可以帮您？",
    thanks: "您的请求已创建——很高兴能帮到您。需要再提交请求时随时找我。",
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
    date: { set: "设置日期" },
    multichoice: { confirm: "确认选择", clear: "清除" },
    freeInput: { submit: "提交" },
    toggle: { on: "是", off: "否" },
    cascade: { accept: "是的，正确", edit: "手动输入" },
    draft: { title: "请求", empty: "尚未选择服务。", emptyHint: "在聊天中描述您的请求。", beneficiary: "接收人", forSelf: "给我", loading: "加载中……", collapse: "收起", expand: "显示", requestLabel: "草稿" },
    phase: { context: "背景", routing: "路由", detail: "详情" },
    status: { draft: "草稿", confirmed: "确认中", submitted: "已创建", escalated: "升级" },
    time: { justNow: "刚刚", minutesAgo: "{{count}} 分钟前" },
    meta: { details: "详情（{{count}}）" },
    slot: { required: "必填", edit: "编辑", stale: "需要重新确认" },
    liveChat: "在线客服",
    newChat: "新对话",
    language: "语言",
    settings: { title: "AI 设置", open: "AI 设置", close: "关闭", language: "语言", languageHint: "用于 AI 回复以及语音和文本识别。已关闭自动检测。", voice: "助手语音", voiceDefault: "默认", voiceHint: "用于助手语音回复的声音。" },
    sources: { view: "查看来源", title: "来源", collection: "集合", relevance: "相关性", close: "关闭" },
    review: { title: "请核对您的请求", edit: "编辑", editField: "编辑“{{field}}”", editEcho: "编辑“{{field}}”" },
    explain: { trigger: "说明：{{title}}", triggerTooltip: "获取关于此项的帮助" },
    navigate: { goThere: "前往", goTo: "导航到 {{path}}" },
    floatingChat: { defaultTitle: "帮助", close: "关闭" },
    stopped: "请求已停止。"
  } }
}, Xi = "fdv2-lang", ke = fe.createInstance();
ke.use(ia).init({
  resources: da,
  lng: typeof localStorage < "u" && localStorage.getItem(Xi) || "en",
  fallbackLng: "en",
  supportedLngs: Jn.map((e) => e.code),
  interpolation: { escapeValue: !1 },
  react: { useSuspense: !1 }
});
function pa(e) {
  const t = Jn.find((n) => n.code === e);
  return t ? t.dir : "ltr";
}
function nt() {
  return ke.language || "en";
}
function $r() {
  return pa(nt());
}
function ga(e) {
  ke.changeLanguage(e);
  try {
    localStorage.setItem(Xi, e);
  } catch {
  }
}
const Br = (e) => {
  let t;
  const n = /* @__PURE__ */ new Set(), r = (l, f) => {
    const c = typeof l == "function" ? l(t) : l;
    if (!Object.is(c, t)) {
      const d = t;
      t = f ?? (typeof c != "object" || c === null) ? c : Object.assign({}, t, c), n.forEach((h) => h(t, d));
    }
  }, i = () => t, a = { setState: r, getState: i, getInitialState: () => u, subscribe: (l) => (n.add(l), () => n.delete(l)) }, u = t = e(r, i, a);
  return a;
}, ma = ((e) => e ? Br(e) : Br), ya = (e) => e;
function ba(e, t = ya) {
  const n = Me.useSyncExternalStore(
    e.subscribe,
    Me.useCallback(() => t(e.getState()), [e, t]),
    Me.useCallback(() => t(e.getInitialState()), [e, t])
  );
  return Me.useDebugValue(n), n;
}
const Vr = (e) => {
  const t = ma(e), n = (r) => ba(t, r);
  return Object.assign(n, t), n;
}, xa = ((e) => e ? Vr(e) : Vr);
function Zi(e, t) {
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
const On = (e) => (t) => {
  try {
    const n = e(t);
    return n instanceof Promise ? n : {
      then(r) {
        return On(r)(n);
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
        return On(r)(n);
      }
    };
  }
}, ka = (e, t) => (n, r, i) => {
  let s = {
    storage: Zi(() => window.localStorage),
    partialize: (k) => k,
    version: 0,
    merge: (k, b) => ({
      ...b,
      ...k
    }),
    ...t
  }, o = !1, a = 0;
  const u = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Set();
  let f = s.storage;
  if (!f)
    return e(
      (...k) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${s.name}', the given storage is currently unavailable.`
        ), n(...k);
      },
      r,
      i
    );
  const c = () => {
    const k = s.partialize({ ...r() });
    return f.setItem(s.name, {
      state: k,
      version: s.version
    });
  }, d = i.setState;
  i.setState = (k, b) => (d(k, b), c());
  const h = e(
    (...k) => (n(...k), c()),
    r,
    i
  );
  i.getInitialState = () => h;
  let p;
  const g = () => {
    var k, b;
    if (!f) return;
    const S = ++a;
    o = !1, u.forEach((I) => {
      var R;
      return I((R = r()) != null ? R : h);
    });
    const w = ((b = s.onRehydrateStorage) == null ? void 0 : b.call(s, (k = r()) != null ? k : h)) || void 0;
    return On(f.getItem.bind(f))(s.name).then((I) => {
      if (I)
        if (typeof I.version == "number" && I.version !== s.version) {
          if (s.migrate) {
            const R = s.migrate(
              I.state,
              I.version
            );
            return R instanceof Promise ? R.then((C) => [!0, C]) : [!0, R];
          }
          console.error(
            "State loaded from storage couldn't be migrated since no migrate function was provided"
          );
        } else
          return [!1, I.state];
      return [!1, void 0];
    }).then((I) => {
      var R;
      if (S !== a)
        return;
      const [C, z] = I;
      if (p = s.merge(
        z,
        (R = r()) != null ? R : h
      ), n(p, !0), C)
        return c();
    }).then(() => {
      S === a && (w?.(r(), void 0), p = r(), o = !0, l.forEach((I) => I(p)));
    }).catch((I) => {
      S === a && w?.(void 0, I);
    });
  };
  return i.persist = {
    setOptions: (k) => {
      s = {
        ...s,
        ...k
      }, k.storage && (f = k.storage);
    },
    clearStorage: () => {
      f?.removeItem(s.name);
    },
    getOptions: () => s,
    rehydrate: () => g(),
    hasHydrated: () => o,
    onHydrate: (k) => (u.add(k), () => {
      u.delete(k);
    }),
    onFinishHydration: (k) => (l.add(k), () => {
      l.delete(k);
    })
  }, s.skipHydration || g(), p || h;
}, wa = ka, Hr = (e) => Symbol.iterator in e, Ur = (e) => (
  // HACK: avoid checking entries type
  "entries" in e
), qr = (e, t) => {
  const n = e instanceof Map ? e : new Map(e.entries()), r = t instanceof Map ? t : new Map(t.entries());
  if (n.size !== r.size)
    return !1;
  for (const [i, s] of n)
    if (!r.has(i) || !Object.is(s, r.get(i)))
      return !1;
  return !0;
}, va = (e, t) => {
  const n = e[Symbol.iterator](), r = t[Symbol.iterator]();
  let i = n.next(), s = r.next();
  for (; !i.done && !s.done; ) {
    if (!Object.is(i.value, s.value))
      return !1;
    i = n.next(), s = r.next();
  }
  return !!i.done && !!s.done;
};
function Sa(e, t) {
  return Object.is(e, t) ? !0 : typeof e != "object" || e === null || typeof t != "object" || t === null || Object.getPrototypeOf(e) !== Object.getPrototypeOf(t) ? !1 : Hr(e) && Hr(t) ? Ur(e) && Ur(t) ? qr(e, t) : va(e, t) : qr(
    { entries: () => Object.entries(e) },
    { entries: () => Object.entries(t) }
  );
}
function Yn(e) {
  const t = Me.useRef(void 0);
  return (n) => {
    const r = e(n);
    return Sa(t.current, r) ? t.current : t.current = r;
  };
}
const Pn = {
  apiBaseUrl: "",
  userId: "fdv2-demo-user",
  getAuthHeaders: null,
  fetchImpl: null,
  eventSourceImpl: null,
  onSubmitted: null,
  onError: null,
  onSessionStart: null
};
let Ke = { ...Pn };
function Ca(e = {}) {
  const t = { ...Pn };
  for (const n of Object.keys(Pn))
    e[n] !== void 0 && e[n] !== null && (t[n] = e[n]);
  Ke = t;
}
function Oe() {
  return Ke;
}
function Qn(e) {
  const t = (Ke.apiBaseUrl || "").replace(/\/+$/, "");
  if (!t)
    throw new Error(
      '[altiora-chat] apiBaseUrl is not configured. Pass it to <AltioraChat apiBaseUrl="https://host/api/v1" />.'
    );
  return `${t}${e}`;
}
function Ge() {
  return Ke.fetchImpl || globalThis.fetch.bind(globalThis);
}
async function ze(e = {}) {
  const t = typeof Ke.getAuthHeaders == "function" ? await Ke.getAuthHeaders() : null;
  return { ...e, ...t || {} };
}
function Kr(e, ...t) {
  const n = Ke[e];
  if (typeof n == "function")
    try {
      n(...t);
    } catch (r) {
      console.error(`[flowdesk-chat-v2] ${e} callback threw:`, r);
    }
}
class Q extends Error {
  constructor(t, n) {
    super(n), this.name = "ChatError", this.code = t;
  }
}
const Ea = 12e4, Ia = 3, ot = (e) => Qn(e);
async function es(e) {
  let t;
  try {
    t = await Ge()(ot(`/flowdesk/draft/${encodeURIComponent(e)}`), {
      headers: await ze()
    });
  } catch (n) {
    throw new Q("NETWORK", n.message);
  }
  if (t.status === 404) return null;
  if (!t.ok) throw new Q("SERVER", `getDraft HTTP ${t.status}`);
  return t.json();
}
async function Ta(e) {
  let t;
  try {
    t = await Ge()(ot(`/flowdesk/voice/transcript/${encodeURIComponent(e)}`), {
      headers: await ze()
    });
  } catch (r) {
    throw new Q("NETWORK", r.message);
  }
  if (t.status === 404) return [];
  if (!t.ok) throw new Q("SERVER", `getVoiceTranscript HTTP ${t.status}`);
  const n = await t.json();
  return Array.isArray(n.messages) ? n.messages : [];
}
async function Na(e) {
  let t;
  try {
    t = await Ge()(ot(`/flowdesk/schema/${encodeURIComponent(e)}`), {
      headers: await ze()
    });
  } catch (n) {
    throw new Q("NETWORK", n.message);
  }
  if (t.status === 404) return null;
  if (!t.ok) throw new Q("SERVER", `getSchema HTTP ${t.status}`);
  return t.json();
}
async function La(e, t) {
  let n;
  try {
    n = await Ge()(ot(`/flowdesk/draft/${encodeURIComponent(e)}`), {
      method: "PATCH",
      headers: await ze({ "Content-Type": "application/json" }),
      body: JSON.stringify({ patches: t })
    });
  } catch (i) {
    throw new Q("NETWORK", i.message);
  }
  const r = await n.json().catch(() => ({}));
  if (r.error) throw new Q("SERVER", typeof r.error == "string" ? r.error : r.detail || "patch failed");
  if (!n.ok) throw new Q("SERVER", `patchDraft HTTP ${n.status}`);
  return r;
}
async function Aa(e, t, n, { signal: r, choice: i, controlAction: s, anchor: o, formEvent: a, lang: u, userContext: l } = {}) {
  const f = new AbortController(), c = setTimeout(() => f.abort(), Ea);
  r && r.addEventListener("abort", () => f.abort(), { once: !0 });
  const d = { sessionId: e, userId: t, lang: u, ...l ? { userContext: l } : {} }, h = o ? { ...d, anchor: o } : s ? { ...d, controlAction: s } : i ? { ...d, choice: i } : a ? { ...d, formEvent: a } : { ...d, message: n };
  let p;
  try {
    p = await Ge()(ot("/flowdesk/chat"), {
      method: "POST",
      headers: await ze({ "Content-Type": "application/json" }),
      body: JSON.stringify(h),
      signal: f.signal
    });
  } catch (b) {
    throw clearTimeout(c), b.name === "AbortError" ? new Q("TIMEOUT", "The assistant took too long to respond.") : new Q("NETWORK", b.message);
  }
  clearTimeout(c);
  const g = await p.json().catch(() => {
    throw new Q("SERVER", `Non-JSON response (HTTP ${p.status})`);
  });
  if (g.error) throw new Q("SERVER", typeof g.error == "string" ? g.error : g.detail || "Chat failed");
  if (!p.ok) throw new Q("SERVER", `chat HTTP ${p.status}`);
  let k = null;
  try {
    k = await es(e);
  } catch {
  }
  return { ...g, draft: k };
}
const og = ["connected", "turn:start", "node:start", "node:done", "turn:done"];
function Ra(e, t = {}, n = {}) {
  const r = n.EventSourceImpl || Oe().eventSourceImpl || (typeof EventSource < "u" ? EventSource : null);
  if (!r)
    return t.onError?.(new Q("SSE_DISCONNECT", "EventSource unavailable")), () => {
    };
  let i;
  try {
    i = ot(`/flowdesk/chat/${encodeURIComponent(e)}/stream`);
  } catch (c) {
    return t.onError?.(new Q("SSE_DISCONNECT", c.message)), () => {
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
      const d = l(c);
      t.onNode?.(d.node, "start", d);
    }), s.addEventListener("node:done", (c) => {
      const d = l(c);
      t.onNode?.(d.node, "done", d);
    }), s.onerror = () => {
      if (a) return;
      try {
        s.close();
      } catch {
      }
      if (o >= Ia) {
        t.onError?.(new Q("SSE_DISCONNECT", "Lost progress stream"));
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
const Se = { sendMessage: Aa, getDraft: es, patchDraft: La, subscribeProgress: Ra, getSchema: Na, getVoiceTranscript: Ta };
let Wr = 0;
function sn(e, t, n) {
  return Wr += 1, { id: `m${Date.now()}_${Wr}`, role: e, content: t, timestamp: (/* @__PURE__ */ new Date()).toISOString(), metadata: n || null };
}
function dt(e) {
  return {
    choices: e.choices || null,
    // controls[] (I-3): the typed turn-contract; ControlRenderer prefers it, falling
    // back to resolveChoices during the deprecation window.
    controls: Array.isArray(e.controls) ? e.controls : null,
    responseType: e.responseType || "text",
    preamble: e.preamble || null,
    resolveChoices: e.resolveChoices || null,
    // sources[] (Phase 2 "Show sources") — KB origins of the answer, carried from
    // the backend turn response (top-level `sources`). Always an array so the
    // bubble can render a bottom-right icon only when there is at least one.
    sources: Array.isArray(e.sources) ? e.sources : [],
    // navigate (Phase 5 SITE_NAVIGATE) — {path, highlight?} destination; the bubble
    // renders a "Go there" link that calls the host onNavigate. Null when absent.
    navigate: e.navigate || null,
    // review (confirm-form) — grouped summary of collected values; the bubble renders
    // it as a table with a per-editable-row ✎ button.
    review: e.review || null,
    // Hand-off to Altiora's own request form (P1: the wizard opens prefilled).
    openForm: e.openForm || null,
    executionLog: e.executionLog || null,
    srNumber: e.spawnResult?.requestId || e.state?.srNumber || null,
    isComplete: !!e.isComplete,
    // Chat-agent read intents: structured payloads a host chrome may render richly.
    ...Array.isArray(e.tickets) ? { tickets: e.tickets, totalCount: e.totalCount } : {},
    ...Array.isArray(e.breadcrumb) ? { breadcrumb: e.breadcrumb } : {}
  };
}
function Oa() {
  return `fdv2-${typeof crypto < "u" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}
const on = () => ({ id: Oa(), serviceId: null, schemaVersion: null, status: "idle" }), et = () => ({ slots: {}, beneficiary: null, patches: [] }), an = () => ({ loading: !1, error: null, currentNode: null, composerDisabled: !1, draftPanelOpen: !0, completed: !1 });
function Pa(e) {
  let t = { sessionId: null, unsub: null };
  function n(i, s, o) {
    if (t.sessionId === i && t.unsub) return;
    if (t.unsub)
      try {
        t.unsub();
      } catch {
      }
    const a = Se.subscribeProgress(i, {
      onNode: (u, l) => s(l === "start" ? u : null),
      onTurnDone: () => o()
    });
    t = { sessionId: i, unsub: a };
  }
  function r() {
    if (t.unsub)
      try {
        t.unsub();
      } catch {
      }
    t = { sessionId: null, unsub: null };
  }
  return xa(
    wa(
      (i, s) => ({
        session: on(),
        messages: [],
        draft: et(),
        schema: null,
        // compiled SchemaSnapshot for the active service (labels/phases/dependsOn)
        user: null,
        // the current user profile (from the host) — identity + greeting
        anchorContext: null,
        // Phase 3: UI-anchor the chat was opened from (Phase 4 zero-query source)
        ui: an(),
        actions: {
          /** Append a message (any role). Returns the created message. */
          addMessage: (o, a, u) => {
            const l = sn(o, a, u);
            return i((f) => ({ messages: [...f.messages, l] })), l;
          },
          /**
           * Set the current user profile (host prop). Seeds a personalized greeting on
           * first set when the thread is empty. Idempotent for the same userId.
           */
          setUser: (o) => {
            !o || !o.userId || s().user && s().user.userId === o.userId || (i(() => ({ user: o })), s().messages.length === 0 && s().actions.seedGreeting());
          },
          /** Seed the first assistant message: greeting by FIRST name, in the selected language. */
          seedGreeting: () => {
            const o = s().user;
            if (!o || s().messages.length > 0 || s().anchorContext) return;
            const a = o.firstName || (o.displayName ? String(o.displayName).split(/\s+/)[0] : "") || o.name || "", u = ke.t("greeting", { name: a });
            s().actions.addMessage("assistant", u, { responseType: "greeting" });
          },
          /** Send a turn: optimistic user message → SSE progress + POST → assistant
           *  reply + draft refresh. SSE stays open across turns for the session. */
          sendMessage: async (o, a, u) => {
            const l = (o || "").trim();
            if (!l || s().ui.loading) return;
            const { actions: f } = s(), c = s().session.id, d = s().user?.userId || a || Oe().userId;
            f.addMessage("user", l), i((h) => ({ ui: { ...h.ui, loading: !0, error: null, currentNode: null } })), n(c, f.setCurrentNode, () => f.setCurrentNode(null));
            try {
              const h = await Se.sendMessage(c, d, l, { signal: u, lang: nt(), userContext: s().user || void 0 });
              f.addMessage("assistant", h.response, dt(h)), h.draft && f.updateDraft(h.draft), f.applyTurnResult(h);
              const p = h?.state?.serviceId;
              if (p && s().schema?.serviceId !== p)
                try {
                  const g = await Se.getSchema(p);
                  g && i(() => ({ schema: g }));
                } catch {
                }
            } catch (h) {
              if (u?.aborted) {
                i((g) => ({ ui: { ...g.ui, loading: !1, currentNode: null } })), f.addMessage("system", ke.t("stopped"));
                return;
              }
              const p = h instanceof Q ? h : new Q("SERVER", h.message);
              f.setError({ code: p.code, message: p.message }), f.addMessage("system", `⚠️ ${p.message}`);
            }
          },
          /** Phase 4: zero-query explain from a UI anchor. No user bubble — the
           *  assistant opens with context-aware help as the first message. */
          sendAnchorExplain: async (o, a) => {
            const u = o ? { id: o.anchorId, title: o.anchorTitle, initialQuery: o.initialQuery } : null;
            if (!u || !u.id || s().ui.loading) return;
            const { actions: l } = s(), f = s().session.id, c = s().user?.userId || a || Oe().userId;
            l.setAnchorContext(o), i((d) => ({ ui: { ...d.ui, loading: !0, error: null, currentNode: null } })), n(f, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const d = await Se.sendMessage(f, c, null, { anchor: u, lang: nt(), userContext: s().user || void 0 });
              l.addMessage("assistant", d.response, dt(d)), l.applyTurnResult(d);
            } catch (d) {
              const h = d instanceof Q ? d : new Q("SERVER", d.message);
              l.setError({ code: h.code, message: h.message }), l.addMessage("system", `⚠️ ${h.message}`);
            }
          },
          /** Send a structured confirm-or-choose selection (F9.1f). */
          sendChoice: async (o, a, u) => {
            if (s().ui.loading) return;
            const { actions: l } = s(), f = s().session.id, c = s().user?.userId || u || Oe().userId;
            l.addMessage("user", a || o.value || ke.t("choice.yes")), i((d) => ({ ui: { ...d.ui, loading: !0, error: null, currentNode: null } })), n(f, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const d = await Se.sendMessage(f, c, null, { choice: o, lang: nt(), userContext: s().user || void 0 });
              l.addMessage("assistant", d.response, dt(d)), d.draft && l.updateDraft(d.draft), l.applyTurnResult(d);
              const h = d?.state?.serviceId;
              if (h && s().schema?.serviceId !== h)
                try {
                  const p = await Se.getSchema(h);
                  p && i(() => ({ schema: p }));
                } catch {
                }
            } catch (d) {
              const h = d instanceof Q ? d : new Q("SERVER", d.message);
              l.setError({ code: h.code, message: h.message }), l.addMessage("system", `⚠️ ${h.message}`);
            }
          },
          /** Send a controls[] reply (I-3). Mirrors sendChoice; POSTs {controlAction}. */
          sendControlAction: async (o, a, u) => {
            if (s().ui.loading) return;
            const { actions: l } = s(), f = s().session.id, c = s().user?.userId || u || Oe().userId;
            l.addMessage("user", a || o.value || ke.t("choice.yes")), i((d) => ({ ui: { ...d.ui, loading: !0, error: null, currentNode: null } })), n(f, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const d = await Se.sendMessage(f, c, null, { controlAction: o, lang: nt(), userContext: s().user || void 0 });
              l.addMessage("assistant", d.response, dt(d)), d.draft && l.updateDraft(d.draft), l.applyTurnResult(d);
              const h = d?.state?.serviceId;
              if (h && s().schema?.serviceId !== h)
                try {
                  const p = await Se.getSchema(h);
                  p && i(() => ({ schema: p }));
                } catch {
                }
            } catch (d) {
              const h = d instanceof Q ? d : new Q("SERVER", d.message);
              l.setError({ code: h.code, message: h.message }), l.addMessage("system", `⚠️ ${h.message}`);
            }
          },
          // P1 — a system signal from the host, not something the user typed. The form
          // reporting a created request is the case today: the assistant closes the draft
          // and offers what to do next. No user bubble is added — nothing was said.
          notifyFormEvent: async (o, a) => {
            if (!o || s().ui.loading) return;
            const { actions: u } = s(), l = s().session.id, f = s().user?.userId || a || Oe().userId;
            i((c) => ({ ui: { ...c.ui, loading: !0, error: null, currentNode: null } })), n(l, u.setCurrentNode, () => u.setCurrentNode(null));
            try {
              const c = await Se.sendMessage(l, f, null, { formEvent: o, lang: nt(), userContext: s().user || void 0 });
              u.addMessage("assistant", c.response, dt(c)), c.draft && u.updateDraft(c.draft), u.applyTurnResult(c);
            } catch (c) {
              const d = c instanceof Q ? c : new Q("SERVER", c.message);
              u.setError({ code: d.code, message: d.message }), u.addMessage("system", `⚠️ ${d.message}`);
            } finally {
              i((c) => ({ ui: { ...c.ui, loading: !1 } }));
            }
          },
          startSession: (o = null) => {
            r(), i(() => ({
              session: { ...on(), serviceId: o },
              messages: [],
              draft: et(),
              schema: null,
              ui: an()
            })), s().actions.seedGreeting();
          },
          resetSession: () => {
            r(), i(() => ({ session: on(), messages: [], draft: et(), schema: null, ui: an() })), s().actions.seedGreeting();
          },
          /**
           * Addition 4 — the request has been created (the Altiora wizard was submitted
           * after a hand-off): post a closing "glad to help" message and end assisted
           * composition. The draft/service is cleared and the composer is locked; a new
           * request begins a fresh session on the next load. Idempotent within a session.
           */
          completeWithThanks: (o = null) => {
            s().ui.completed || (s().actions.addMessage("assistant", ke.t("thanks"), { responseType: "thanks", ...o ? { srNumber: o } : {} }), i((a) => ({
              session: { ...a.session, serviceId: null, status: "submitted" },
              draft: et(),
              ui: { ...a.ui, loading: !1, currentNode: null, completed: !0, composerDisabled: !0 }
            })));
          },
          /**
           * Adopt an externally-owned session id (Phase V1.1) so this chat shares ONE
           * backend session with another surface — e.g. the portal voice launcher
           * makes its text window and its voice channel the SAME assistant session
           * (shared DraftSR + history + server-side turn context). Idempotent; a
           * no-op when the id already matches. Keeps the current thread (messages are
           * mount-fresh, so there is nothing to lose) and re-points progress.
           */
          adoptSession: (o) => {
            !o || s().session.id === o || (r(), i((a) => ({ session: { ...a.session, id: o } })));
          },
          /**
           * VF1-004: append a VOICE-originated turn to the thread — no API call, no
           * controls, just the spoken line rendered as text (voice+text are one
           * session). Deduped against the immediately-preceding message so a live
           * push can't double a turn.
           */
          addVoiceTranscript: ({ role: o, content: a, timestamp: u } = {}) => {
            if (!a || o !== "user" && o !== "assistant") return;
            const l = s().messages, f = l[l.length - 1];
            if (f && f.role === o && f.content === a) return;
            const c = { source: "voice", ...u ? { clientTimestamp: u } : {} };
            i((d) => ({ messages: [...d.messages, sn(o, a, c)] }));
          },
          /**
           * VF1-005: merge a server-persisted voice transcript into the thread,
           * skipping turns already present (dedup by role+content) so hydration on
           * open never duplicates lines the live bridge already pushed.
           */
          hydrateTranscripts: (o) => {
            !Array.isArray(o) || o.length === 0 || i((a) => {
              const u = new Set(a.messages.map((f) => `${f.role}\0${f.content}`)), l = [];
              for (const f of o) {
                if (!f || f.role !== "user" && f.role !== "assistant" || !f.content) continue;
                const c = `${f.role}\0${f.content}`;
                u.has(c) || (u.add(c), l.push(sn(f.role, f.content, { source: f.metadata && f.metadata.source || "voice" })));
              }
              return l.length ? { messages: [...a.messages, ...l] } : {};
            });
          },
          /** VF1-005: fetch this session's persisted voice transcript and hydrate it. */
          loadVoiceHistory: async () => {
            const o = s().session.id;
            try {
              const a = await Se.getVoiceTranscript(o);
              s().actions.hydrateTranscripts(a);
            } catch {
            }
          },
          /** Merge a server turn result into session + draft. */
          applyTurnResult: (o) => {
            i((u) => ({
              session: {
                ...u.session,
                serviceId: o?.state?.serviceId ?? u.session.serviceId,
                status: o?.state?.status ?? (o?.isComplete ? "submitted" : "active")
              },
              ui: { ...u.ui, loading: !1, currentNode: null }
            }));
            const a = o?.spawnResult?.requestId || o?.state?.srNumber || null;
            a && Kr("onSubmitted", { srNumber: a, sessionId: s().session.id, serviceId: s().session.serviceId, result: o });
          },
          updateDraft: (o) => i(() => ({ draft: { ...et(), ...o || {} } })),
          /** Inline slot edit from the DraftPanel: optimistic → patchDraft → reconcile. */
          patchSlot: async (o, a) => {
            const u = s().session.id, l = s().draft;
            i((f) => ({ draft: { ...f.draft, slots: { ...f.draft.slots, [o]: { ...f.draft.slots[o] || {}, value: a, provenance: "user_edited", stale: !1 } } } }));
            try {
              const f = await Se.patchDraft(u, [{ op: "set", slotId: o, value: a, provenance: "user_edited" }]);
              f && f.slots && i(() => ({ draft: { ...et(), ...f } }));
            } catch (f) {
              i(() => ({ draft: l })), s().actions.setError({ code: f.code || "SERVER", message: f.message });
            }
          },
          /** Phase 3: remember the UI anchor the chat was opened from (floating window). */
          setAnchorContext: (o) => i(() => ({ anchorContext: o || null })),
          setCurrentNode: (o) => i((a) => ({ ui: { ...a.ui, currentNode: o } })),
          setLoading: (o) => i((a) => ({ ui: { ...a.ui, loading: o } })),
          setError: (o) => {
            i((a) => ({ ui: { ...a.ui, error: o, loading: !1, currentNode: null } })), Kr("onError", o);
          },
          clearError: () => i((o) => ({ ui: { ...o.ui, error: null } })),
          toggleDraftPanel: () => i((o) => ({ ui: { ...o.ui, draftPanelOpen: !o.ui.draftPanelOpen } }))
        }
      }),
      {
        // Store-scoped key: each storeId keeps its OWN session id (the 'assistant'
        // window and the Home 'default' chat must not clobber each other's thread).
        name: e === "default" ? "fdv2-chat" : `fdv2-chat-${e}`,
        storage: Zi(() => sessionStorage),
        // A fresh chat every load: the session id is intentionally NOT persisted, so a
        // page (re)load always begins a NEW chat session rather than resuming a stale
        // thread. In-tab interactions keep the same in-memory session (the store is a
        // singleton); only a full reload starts anew. Messages are never persisted.
        partialize: () => ({}),
        merge: (i, s) => ({ ...s })
      }
    )
  );
}
const ln = /* @__PURE__ */ new Map();
function ts(e = "default") {
  return ln.has(e) || ln.set(e, Pa(e)), ln.get(e);
}
const ns = ts("default"), rs = Kn(null);
function _a({ storeId: e = "default", children: t }) {
  const n = bt(() => ts(e), [e]);
  return Hi(rs.Provider, { value: n }, t);
}
function Je() {
  return Wn(rs) || ns;
}
const is = () => Je()((e) => e.messages), ss = () => Je()(Yn((e) => e.session)), Da = () => Je()(Yn((e) => e.draft)), Fa = () => Je()((e) => e.schema), we = () => Je()(Yn((e) => e.ui)), Pe = () => Je()((e) => e.actions), Gt = "fdv2-ai-prefs", _n = "fdv2:aiPrefsChanged", un = { language: "en", voice: null };
function Ma() {
  try {
    return typeof localStorage < "u" && localStorage.getItem(Gt) != null;
  } catch {
    return !1;
  }
}
function zt() {
  try {
    const e = typeof localStorage < "u" ? localStorage.getItem(Gt) : null;
    return e ? { ...un, ...JSON.parse(e) } : { ...un };
  } catch {
    return { ...un };
  }
}
function os(e) {
  const t = { ...zt(), ...e || {} };
  try {
    localStorage.setItem(Gt, JSON.stringify(t));
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent(_n, { detail: t }));
  } catch {
  }
  return t;
}
function Xn() {
  const [e, t] = ne(zt);
  te(() => {
    const r = (s) => t(s.detail || zt()), i = (s) => {
      s.key === Gt && t(zt());
    };
    return window.addEventListener(_n, r), window.addEventListener("storage", i), () => {
      window.removeEventListener(_n, r), window.removeEventListener("storage", i);
    };
  }, []);
  const n = Ce((r) => os(r), []);
  return [e, n];
}
function za(e, t) {
  const n = {};
  return (e[e.length - 1] === "" ? [...e, ""] : e).join(
    (n.padRight ? " " : "") + "," + (n.padLeft === !1 ? "" : " ")
  ).trim();
}
const ja = /^[$_\p{ID_Start}][$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, $a = /^[$_\p{ID_Start}][-$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, Ba = {};
function Gr(e, t) {
  return (Ba.jsx ? $a : ja).test(e);
}
const Va = /[ \t\n\f\r]/g;
function Ha(e) {
  return typeof e == "object" ? e.type === "text" ? Jr(e.value) : !1 : Jr(e);
}
function Jr(e) {
  return e.replace(Va, "") === "";
}
class Tt {
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
Tt.prototype.normal = {};
Tt.prototype.property = {};
Tt.prototype.space = void 0;
function as(e, t) {
  const n = {}, r = {};
  for (const i of e)
    Object.assign(n, i.property), Object.assign(r, i.normal);
  return new Tt(n, r, t);
}
function Dn(e) {
  return e.toLowerCase();
}
class ge {
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
ge.prototype.attribute = "";
ge.prototype.booleanish = !1;
ge.prototype.boolean = !1;
ge.prototype.commaOrSpaceSeparated = !1;
ge.prototype.commaSeparated = !1;
ge.prototype.defined = !1;
ge.prototype.mustUseProperty = !1;
ge.prototype.number = !1;
ge.prototype.overloadedBoolean = !1;
ge.prototype.property = "";
ge.prototype.spaceSeparated = !1;
ge.prototype.space = void 0;
let Ua = 0;
const $ = Ye(), re = Ye(), Fn = Ye(), T = Ye(), Y = Ye(), Ue = Ye(), ye = Ye();
function Ye() {
  return 2 ** ++Ua;
}
const Mn = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  boolean: $,
  booleanish: re,
  commaOrSpaceSeparated: ye,
  commaSeparated: Ue,
  number: T,
  overloadedBoolean: Fn,
  spaceSeparated: Y
}, Symbol.toStringTag, { value: "Module" })), cn = (
  /** @type {ReadonlyArray<keyof typeof types>} */
  Object.keys(Mn)
);
class Zn extends ge {
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
    if (super(t, n), Yr(this, "space", i), typeof r == "number")
      for (; ++s < cn.length; ) {
        const o = cn[s];
        Yr(this, cn[s], (r & Mn[o]) === Mn[o]);
      }
  }
}
Zn.prototype.defined = !0;
function Yr(e, t, n) {
  n && (e[t] = n);
}
function at(e) {
  const t = {}, n = {};
  for (const [r, i] of Object.entries(e.properties)) {
    const s = new Zn(
      r,
      e.transform(e.attributes || {}, r),
      i,
      e.space
    );
    e.mustUseProperty && e.mustUseProperty.includes(r) && (s.mustUseProperty = !0), t[r] = s, n[Dn(r)] = r, n[Dn(s.attribute)] = r;
  }
  return new Tt(t, n, e.space);
}
const ls = at({
  properties: {
    ariaActiveDescendant: null,
    ariaAtomic: re,
    ariaAutoComplete: null,
    ariaBusy: re,
    ariaChecked: re,
    ariaColCount: T,
    ariaColIndex: T,
    ariaColSpan: T,
    ariaControls: Y,
    ariaCurrent: null,
    ariaDescribedBy: Y,
    ariaDetails: null,
    ariaDisabled: re,
    ariaDropEffect: Y,
    ariaErrorMessage: null,
    ariaExpanded: re,
    ariaFlowTo: Y,
    ariaGrabbed: re,
    ariaHasPopup: null,
    ariaHidden: re,
    ariaInvalid: null,
    ariaKeyShortcuts: null,
    ariaLabel: null,
    ariaLabelledBy: Y,
    ariaLevel: T,
    ariaLive: null,
    ariaModal: re,
    ariaMultiLine: re,
    ariaMultiSelectable: re,
    ariaOrientation: null,
    ariaOwns: Y,
    ariaPlaceholder: null,
    ariaPosInSet: T,
    ariaPressed: re,
    ariaReadOnly: re,
    ariaRelevant: null,
    ariaRequired: re,
    ariaRoleDescription: Y,
    ariaRowCount: T,
    ariaRowIndex: T,
    ariaRowSpan: T,
    ariaSelected: re,
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
function us(e, t) {
  return t in e ? e[t] : t;
}
function cs(e, t) {
  return us(e, t.toLowerCase());
}
const qa = at({
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
    accept: Ue,
    acceptCharset: Y,
    accessKey: Y,
    action: null,
    allow: null,
    allowFullScreen: $,
    allowPaymentRequest: $,
    allowUserMedia: $,
    alpha: $,
    alt: null,
    as: null,
    async: $,
    autoCapitalize: null,
    autoComplete: Y,
    autoFocus: $,
    autoPlay: $,
    blocking: Y,
    capture: null,
    charSet: null,
    checked: $,
    cite: null,
    className: Y,
    closedBy: null,
    colorSpace: null,
    cols: T,
    colSpan: T,
    command: null,
    commandFor: null,
    content: null,
    contentEditable: re,
    controls: $,
    controlsList: Y,
    coords: T | Ue,
    crossOrigin: null,
    data: null,
    dateTime: null,
    decoding: null,
    default: $,
    defer: $,
    dir: null,
    dirName: null,
    disabled: $,
    download: Fn,
    draggable: re,
    encType: null,
    enterKeyHint: null,
    fetchPriority: null,
    form: null,
    formAction: null,
    formEncType: null,
    formMethod: null,
    formNoValidate: $,
    formTarget: null,
    headers: Y,
    height: T,
    hidden: Fn,
    high: T,
    href: null,
    hrefLang: null,
    htmlFor: Y,
    httpEquiv: Y,
    id: null,
    imageSizes: null,
    imageSrcSet: null,
    inert: $,
    inputMode: null,
    integrity: null,
    is: null,
    isMap: $,
    itemId: null,
    itemProp: Y,
    itemRef: Y,
    itemScope: $,
    itemType: Y,
    kind: null,
    label: null,
    lang: null,
    language: null,
    list: null,
    loading: null,
    loop: $,
    low: T,
    manifest: null,
    max: null,
    maxLength: T,
    media: null,
    method: null,
    min: null,
    minLength: T,
    multiple: $,
    muted: $,
    name: null,
    nonce: null,
    noModule: $,
    noValidate: $,
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
    open: $,
    optimum: T,
    pattern: null,
    ping: Y,
    placeholder: null,
    playsInline: $,
    popover: null,
    popoverTarget: null,
    popoverTargetAction: null,
    poster: null,
    preload: null,
    readOnly: $,
    referrerPolicy: null,
    rel: Y,
    required: $,
    reversed: $,
    rows: T,
    rowSpan: T,
    sandbox: Y,
    scope: null,
    scoped: $,
    seamless: $,
    selected: $,
    shadowRootClonable: $,
    shadowRootCustomElementRegistry: $,
    shadowRootDelegatesFocus: $,
    shadowRootMode: null,
    shadowRootSerializable: $,
    shape: null,
    size: T,
    sizes: null,
    slot: null,
    span: T,
    spellCheck: re,
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
    typeMustMatch: $,
    useMap: null,
    value: re,
    width: T,
    wrap: null,
    writingSuggestions: null,
    // Legacy.
    // See: https://html.spec.whatwg.org/#other-elements,-attributes-and-apis
    align: null,
    // Several. Use CSS `text-align` instead,
    aLink: null,
    // `<body>`. Use CSS `a:active {color}` instead
    archive: Y,
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
    compact: $,
    // Lists. Use CSS to reduce space between items instead
    declare: $,
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
    noResize: $,
    // `<frame>`
    noHref: $,
    // `<area>`. Use no href instead of an explicit `nohref`
    noShade: $,
    // `<hr>`. Use background-color and height instead of borders
    noWrap: $,
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
    scrolling: re,
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
    credentialless: $,
    disablePictureInPicture: $,
    disableRemotePlayback: $,
    exportParts: Ue,
    part: Y,
    prefix: null,
    property: null,
    results: T,
    security: null,
    unselectable: null
  },
  space: "html",
  transform: cs
}), Ka = at({
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
    about: ye,
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
    className: Y,
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
    download: $,
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
    g1: Ue,
    g2: Ue,
    glyphName: Ue,
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
    kernelMatrix: ye,
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
    ping: Y,
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
    property: ye,
    r: null,
    radius: null,
    referrerPolicy: null,
    refX: null,
    refY: null,
    rel: ye,
    rev: ye,
    renderingIntent: null,
    repeatCount: null,
    repeatDur: null,
    requiredExtensions: ye,
    requiredFeatures: ye,
    requiredFonts: ye,
    requiredFormats: ye,
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
    strokeDashArray: ye,
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
    systemLanguage: ye,
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
    typeOf: ye,
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
  transform: us
}), fs = at({
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
}), hs = at({
  attributes: { xmlnsxlink: "xmlns:xlink" },
  properties: { xmlnsXLink: null, xmlns: null },
  space: "xmlns",
  transform: cs
}), ds = at({
  properties: { xmlBase: null, xmlLang: null, xmlSpace: null },
  space: "xml",
  transform(e, t) {
    return "xml:" + t.slice(3).toLowerCase();
  }
}), Wa = {
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
}, Ga = /[A-Z]/g, Qr = /-[a-z]/g, Ja = /^data[-\w.:]+$/i;
function Ya(e, t) {
  const n = Dn(t);
  let r = t, i = ge;
  if (n in e.normal)
    return e.property[e.normal[n]];
  if (n.length > 4 && n.slice(0, 4) === "data" && Ja.test(t)) {
    if (t.charAt(4) === "-") {
      const s = t.slice(5).replace(Qr, Xa);
      r = "data" + s.charAt(0).toUpperCase() + s.slice(1);
    } else {
      const s = t.slice(4);
      if (!Qr.test(s)) {
        let o = s.replace(Ga, Qa);
        o.charAt(0) !== "-" && (o = "-" + o), t = "data" + o;
      }
    }
    i = Zn;
  }
  return new i(r, t);
}
function Qa(e) {
  return "-" + e.toLowerCase();
}
function Xa(e) {
  return e.charAt(1).toUpperCase();
}
const Za = as([ls, qa, fs, hs, ds], "html"), er = as([ls, Ka, fs, hs, ds], "svg");
function el(e) {
  return e.join(" ").trim();
}
var tt = {}, fn, Xr;
function tl() {
  if (Xr) return fn;
  Xr = 1;
  var e = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, t = /\n/g, n = /^\s*/, r = /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/, i = /^:\s*/, s = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/, o = /^[;\s]*/, a = /^\s+|\s+$/g, u = `
`, l = "/", f = "*", c = "", d = "comment", h = "declaration";
  function p(k, b) {
    if (typeof k != "string")
      throw new TypeError("First argument must be a string");
    if (!k) return [];
    b = b || {};
    var S = 1, w = 1;
    function I(D) {
      var O = D.match(t);
      O && (S += O.length);
      var H = D.lastIndexOf(u);
      w = ~H ? D.length - H : w + D.length;
    }
    function R() {
      var D = { line: S, column: w };
      return function(O) {
        return O.position = new C(D), _(), O;
      };
    }
    function C(D) {
      this.start = D, this.end = { line: S, column: w }, this.source = b.source;
    }
    C.prototype.content = k;
    function z(D) {
      var O = new Error(
        b.source + ":" + S + ":" + w + ": " + D
      );
      if (O.reason = D, O.filename = b.source, O.line = S, O.column = w, O.source = k, !b.silent) throw O;
    }
    function V(D) {
      var O = D.exec(k);
      if (O) {
        var H = O[0];
        return I(H), k = k.slice(H.length), O;
      }
    }
    function _() {
      V(n);
    }
    function v(D) {
      var O;
      for (D = D || []; O = N(); )
        O !== !1 && D.push(O);
      return D;
    }
    function N() {
      var D = R();
      if (!(l != k.charAt(0) || f != k.charAt(1))) {
        for (var O = 2; c != k.charAt(O) && (f != k.charAt(O) || l != k.charAt(O + 1)); )
          ++O;
        if (O += 2, c === k.charAt(O - 1))
          return z("End of comment missing");
        var H = k.slice(2, O - 2);
        return w += 2, I(H), k = k.slice(O), w += 2, D({
          type: d,
          comment: H
        });
      }
    }
    function L() {
      var D = R(), O = V(r);
      if (O) {
        if (N(), !V(i)) return z("property missing ':'");
        var H = V(s), W = D({
          type: h,
          property: g(O[0].replace(e, c)),
          value: H ? g(H[0].replace(e, c)) : c
        });
        return V(o), W;
      }
    }
    function F() {
      var D = [];
      v(D);
      for (var O; O = L(); )
        O !== !1 && (D.push(O), v(D));
      return D;
    }
    return _(), F();
  }
  function g(k) {
    return k ? k.replace(a, c) : c;
  }
  return fn = p, fn;
}
var Zr;
function nl() {
  if (Zr) return tt;
  Zr = 1;
  var e = tt && tt.__importDefault || function(r) {
    return r && r.__esModule ? r : { default: r };
  };
  Object.defineProperty(tt, "__esModule", { value: !0 }), tt.default = n;
  const t = e(tl());
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
  return tt;
}
var pt = {}, ei;
function rl() {
  if (ei) return pt;
  ei = 1, Object.defineProperty(pt, "__esModule", { value: !0 }), pt.camelCase = void 0;
  var e = /^--[a-zA-Z0-9_-]+$/, t = /-([a-z])/g, n = /^[^-]+$/, r = /^-(webkit|moz|ms|o|khtml)-/, i = /^-(ms)-/, s = function(l) {
    return !l || n.test(l) || e.test(l);
  }, o = function(l, f) {
    return f.toUpperCase();
  }, a = function(l, f) {
    return "".concat(f, "-");
  }, u = function(l, f) {
    return f === void 0 && (f = {}), s(l) ? l : (l = l.toLowerCase(), f.reactCompat ? l = l.replace(i, a) : l = l.replace(r, a), l.replace(t, o));
  };
  return pt.camelCase = u, pt;
}
var gt, ti;
function il() {
  if (ti) return gt;
  ti = 1;
  var e = gt && gt.__importDefault || function(i) {
    return i && i.__esModule ? i : { default: i };
  }, t = e(nl()), n = rl();
  function r(i, s) {
    var o = {};
    return !i || typeof i != "string" || (0, t.default)(i, function(a, u) {
      a && u && (o[(0, n.camelCase)(a, s)] = u);
    }), o;
  }
  return r.default = r, gt = r, gt;
}
var sl = il();
const ol = /* @__PURE__ */ Wi(sl), ps = gs("end"), tr = gs("start");
function gs(e) {
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
function al(e) {
  const t = tr(e), n = ps(e);
  if (t && n)
    return { start: t, end: n };
}
function wt(e) {
  return !e || typeof e != "object" ? "" : "position" in e || "type" in e ? ni(e.position) : "start" in e || "end" in e ? ni(e) : "line" in e || "column" in e ? zn(e) : "";
}
function zn(e) {
  return ri(e && e.line) + ":" + ri(e && e.column);
}
function ni(e) {
  return zn(e && e.start) + "-" + zn(e && e.end);
}
function ri(e) {
  return e && typeof e == "number" ? e : 1;
}
class ue extends Error {
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
    this.ancestors = s.ancestors || void 0, this.cause = s.cause || void 0, this.column = a ? a.column : void 0, this.fatal = void 0, this.file = "", this.message = i, this.line = a ? a.line : void 0, this.name = wt(s.place) || "1:1", this.place = s.place || void 0, this.reason = this.message, this.ruleId = s.ruleId || void 0, this.source = s.source || void 0, this.stack = o && s.cause && typeof s.cause.stack == "string" ? s.cause.stack : "", this.actual = void 0, this.expected = void 0, this.note = void 0, this.url = void 0;
  }
}
ue.prototype.file = "";
ue.prototype.name = "";
ue.prototype.reason = "";
ue.prototype.message = "";
ue.prototype.stack = "";
ue.prototype.column = void 0;
ue.prototype.line = void 0;
ue.prototype.ancestors = void 0;
ue.prototype.cause = void 0;
ue.prototype.fatal = void 0;
ue.prototype.place = void 0;
ue.prototype.ruleId = void 0;
ue.prototype.source = void 0;
const nr = {}.hasOwnProperty, ll = /* @__PURE__ */ new Map(), ul = /[A-Z]/g, cl = /* @__PURE__ */ new Set(["table", "tbody", "thead", "tfoot", "tr"]), fl = /* @__PURE__ */ new Set(["td", "th"]), ms = "https://github.com/syntax-tree/hast-util-to-jsx-runtime";
function hl(e, t) {
  if (!t || t.Fragment === void 0)
    throw new TypeError("Expected `Fragment` in options");
  const n = t.filePath || void 0;
  let r;
  if (t.development) {
    if (typeof t.jsxDEV != "function")
      throw new TypeError(
        "Expected `jsxDEV` in options when `development: true`"
      );
    r = kl(n, t.jsxDEV);
  } else {
    if (typeof t.jsx != "function")
      throw new TypeError("Expected `jsx` in production options");
    if (typeof t.jsxs != "function")
      throw new TypeError("Expected `jsxs` in production options");
    r = xl(n, t.jsx, t.jsxs);
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
    schema: t.space === "svg" ? er : Za,
    stylePropertyNameCase: t.stylePropertyNameCase || "dom",
    tableCellAlignToStyle: t.tableCellAlignToStyle !== !1
  }, s = ys(i, e, void 0);
  return s && typeof s != "string" ? s : i.create(
    e,
    i.Fragment,
    { children: s || void 0 },
    void 0
  );
}
function ys(e, t, n) {
  if (t.type === "element")
    return dl(e, t, n);
  if (t.type === "mdxFlowExpression" || t.type === "mdxTextExpression")
    return pl(e, t);
  if (t.type === "mdxJsxFlowElement" || t.type === "mdxJsxTextElement")
    return ml(e, t, n);
  if (t.type === "mdxjsEsm")
    return gl(e, t);
  if (t.type === "root")
    return yl(e, t, n);
  if (t.type === "text")
    return bl(e, t);
}
function dl(e, t, n) {
  const r = e.schema;
  let i = r;
  t.tagName.toLowerCase() === "svg" && r.space === "html" && (i = er, e.schema = i), e.ancestors.push(t);
  const s = xs(e, t.tagName, !1), o = wl(e, t);
  let a = ir(e, t);
  return cl.has(t.tagName) && (a = a.filter(function(u) {
    return typeof u == "string" ? !Ha(u) : !0;
  })), bs(e, o, s, t), rr(o, a), e.ancestors.pop(), e.schema = r, e.create(t, s, o, n);
}
function pl(e, t) {
  if (t.data && t.data.estree && e.evaluater) {
    const r = t.data.estree.body[0];
    return r.type, /** @type {Child | undefined} */
    e.evaluater.evaluateExpression(r.expression);
  }
  Et(e, t.position);
}
function gl(e, t) {
  if (t.data && t.data.estree && e.evaluater)
    return (
      /** @type {Child | undefined} */
      e.evaluater.evaluateProgram(t.data.estree)
    );
  Et(e, t.position);
}
function ml(e, t, n) {
  const r = e.schema;
  let i = r;
  t.name === "svg" && r.space === "html" && (i = er, e.schema = i), e.ancestors.push(t);
  const s = t.name === null ? e.Fragment : xs(e, t.name, !0), o = vl(e, t), a = ir(e, t);
  return bs(e, o, s, t), rr(o, a), e.ancestors.pop(), e.schema = r, e.create(t, s, o, n);
}
function yl(e, t, n) {
  const r = {};
  return rr(r, ir(e, t)), e.create(t, e.Fragment, r, n);
}
function bl(e, t) {
  return t.value;
}
function bs(e, t, n, r) {
  typeof n != "string" && n !== e.Fragment && e.passNode && (t.node = r);
}
function rr(e, t) {
  if (t.length > 0) {
    const n = t.length > 1 ? t : t[0];
    n && (e.children = n);
  }
}
function xl(e, t, n) {
  return r;
  function r(i, s, o, a) {
    const l = Array.isArray(o.children) ? n : t;
    return a ? l(s, o, a) : l(s, o);
  }
}
function kl(e, t) {
  return n;
  function n(r, i, s, o) {
    const a = Array.isArray(s.children), u = tr(r);
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
function wl(e, t) {
  const n = {};
  let r, i;
  for (i in t.properties)
    if (i !== "children" && nr.call(t.properties, i)) {
      const s = Sl(e, i, t.properties[i]);
      if (s) {
        const [o, a] = s;
        e.tableCellAlignToStyle && o === "align" && typeof a == "string" && fl.has(t.tagName) ? r = a : n[o] = a;
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
function vl(e, t) {
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
        Et(e, t.position);
    else {
      const i = r.name;
      let s;
      if (r.value && typeof r.value == "object")
        if (r.value.data && r.value.data.estree && e.evaluater) {
          const a = r.value.data.estree.body[0];
          a.type, s = e.evaluater.evaluateExpression(a.expression);
        } else
          Et(e, t.position);
      else
        s = r.value === null ? !0 : r.value;
      n[i] = /** @type {Props[keyof Props]} */
      s;
    }
  return n;
}
function ir(e, t) {
  const n = [];
  let r = -1;
  const i = e.passKeys ? /* @__PURE__ */ new Map() : ll;
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
    const a = ys(e, s, o);
    a !== void 0 && n.push(a);
  }
  return n;
}
function Sl(e, t, n) {
  const r = Ya(e.schema, t);
  if (!(n == null || typeof n == "number" && Number.isNaN(n))) {
    if (Array.isArray(n) && (n = r.commaSeparated ? za(n) : el(n)), r.property === "style") {
      let i = typeof n == "object" ? n : Cl(e, String(n));
      return e.stylePropertyNameCase === "css" && (i = El(i)), ["style", i];
    }
    return [
      e.elementAttributeNameCase === "react" && r.space ? Wa[r.property] || r.property : r.attribute,
      n
    ];
  }
}
function Cl(e, t) {
  try {
    return ol(t, { reactCompat: !0 });
  } catch (n) {
    if (e.ignoreInvalidStyle)
      return {};
    const r = (
      /** @type {Error} */
      n
    ), i = new ue("Cannot parse `style` attribute", {
      ancestors: e.ancestors,
      cause: r,
      ruleId: "style",
      source: "hast-util-to-jsx-runtime"
    });
    throw i.file = e.filePath || void 0, i.url = ms + "#cannot-parse-style-attribute", i;
  }
}
function xs(e, t, n) {
  let r;
  if (!n)
    r = { type: "Literal", value: t };
  else if (t.includes(".")) {
    const i = t.split(".");
    let s = -1, o;
    for (; ++s < i.length; ) {
      const a = Gr(i[s]) ? { type: "Identifier", name: i[s] } : { type: "Literal", value: i[s] };
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
    r = Gr(t) && !/^[a-z]/.test(t) ? { type: "Identifier", name: t } : { type: "Literal", value: t };
  if (r.type === "Literal") {
    const i = (
      /** @type {string | number} */
      r.value
    );
    return nr.call(e.components, i) ? e.components[i] : i;
  }
  if (e.evaluater)
    return e.evaluater.evaluateExpression(r);
  Et(e);
}
function Et(e, t) {
  const n = new ue(
    "Cannot handle MDX estrees without `createEvaluater`",
    {
      ancestors: e.ancestors,
      place: t,
      ruleId: "mdx-estree",
      source: "hast-util-to-jsx-runtime"
    }
  );
  throw n.file = e.filePath || void 0, n.url = ms + "#cannot-handle-mdx-estrees-without-createevaluater", n;
}
function El(e) {
  const t = {};
  let n;
  for (n in e)
    nr.call(e, n) && (t[Il(n)] = e[n]);
  return t;
}
function Il(e) {
  let t = e.replace(ul, Tl);
  return t.slice(0, 3) === "ms-" && (t = "-" + t), t;
}
function Tl(e) {
  return "-" + e.toLowerCase();
}
const hn = {
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
}, Nl = {};
function sr(e, t) {
  const n = Nl, r = typeof n.includeImageAlt == "boolean" ? n.includeImageAlt : !0, i = typeof n.includeHtml == "boolean" ? n.includeHtml : !0;
  return ks(e, r, i);
}
function ks(e, t, n) {
  if (Ll(e)) {
    if ("value" in e)
      return e.type === "html" && !n ? "" : e.value;
    if (t && "alt" in e && e.alt)
      return e.alt;
    if ("children" in e)
      return ii(e.children, t, n);
  }
  return Array.isArray(e) ? ii(e, t, n) : "";
}
function ii(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; )
    r[i] = ks(e[i], t, n);
  return r.join("");
}
function Ll(e) {
  return !!(e && typeof e == "object");
}
const si = document.createElement("i");
function or(e) {
  const t = "&" + e + ";";
  si.innerHTML = t;
  const n = si.textContent;
  return n.charCodeAt(n.length - 1) === 59 && e !== "semi" || n === t ? !1 : n;
}
function be(e, t, n, r) {
  const i = e.length;
  let s = 0, o;
  if (t < 0 ? t = -t > i ? 0 : i + t : t = t > i ? i : t, n = n > 0 ? n : 0, r.length < 1e4)
    o = Array.from(r), o.unshift(t, n), e.splice(...o);
  else
    for (n && e.splice(t, n); s < r.length; )
      o = r.slice(s, s + 1e4), o.unshift(t, 0), e.splice(...o), s += 1e4, t += 1e4;
}
function xe(e, t) {
  return e.length > 0 ? (be(e, e.length, 0, t), e) : t;
}
const oi = {}.hasOwnProperty;
function ws(e) {
  const t = {};
  let n = -1;
  for (; ++n < e.length; )
    Al(t, e[n]);
  return t;
}
function Al(e, t) {
  let n;
  for (n in t) {
    const i = (oi.call(e, n) ? e[n] : void 0) || (e[n] = {}), s = t[n];
    let o;
    if (s)
      for (o in s) {
        oi.call(i, o) || (i[o] = []);
        const a = s[o];
        Rl(
          // @ts-expect-error Looks like a list.
          i[o],
          Array.isArray(a) ? a : a ? [a] : []
        );
      }
  }
}
function Rl(e, t) {
  let n = -1;
  const r = [];
  for (; ++n < t.length; )
    (t[n].add === "after" ? e : r).push(t[n]);
  be(e, 0, 0, r);
}
function vs(e, t) {
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
function Ee(e) {
  return e.replace(/[\t\n\r ]+/g, " ").replace(/^ | $/g, "").toLowerCase().toUpperCase();
}
const ce = je(/[A-Za-z]/), le = je(/[\dA-Za-z]/), Ol = je(/[#-'*+\--9=?A-Z^-~]/);
function Ht(e) {
  return (
    // Special whitespace codes (which have negative values), C0 and Control
    // character DEL
    e !== null && (e < 32 || e === 127)
  );
}
const jn = je(/\d/), Pl = je(/[\dA-Fa-f]/), _l = je(/[!-/:-@[-`{-~]/);
function M(e) {
  return e !== null && e < -2;
}
function X(e) {
  return e !== null && (e < 0 || e === 32);
}
function U(e) {
  return e === -2 || e === -1 || e === 32;
}
const Jt = je(/\p{P}|\p{S}/u), We = je(/\s/);
function je(e) {
  return t;
  function t(n) {
    return n !== null && n > -1 && e.test(String.fromCharCode(n));
  }
}
function lt(e) {
  const t = [];
  let n = -1, r = 0, i = 0;
  for (; ++n < e.length; ) {
    const s = e.charCodeAt(n);
    let o = "";
    if (s === 37 && le(e.charCodeAt(n + 1)) && le(e.charCodeAt(n + 2)))
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
    return U(u) ? (e.enter(n), a(u)) : t(u);
  }
  function a(u) {
    return U(u) && s++ < i ? (e.consume(u), a) : (e.exit(n), t(u));
  }
}
const Dl = {
  tokenize: Fl
};
function Fl(e) {
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
    return M(a) ? (e.consume(a), e.exit("chunkText"), s) : (e.consume(a), o);
  }
}
const Ml = {
  tokenize: zl
}, ai = {
  tokenize: jl
};
function zl(e) {
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
      t.containerState._closeFlow = void 0, i && S();
      const I = t.events.length;
      let R = I, C;
      for (; R--; )
        if (t.events[R][0] === "exit" && t.events[R][1].type === "chunkFlow") {
          C = t.events[R][1].end;
          break;
        }
      b(r);
      let z = I;
      for (; z < t.events.length; )
        t.events[z][1].end = {
          ...C
        }, z++;
      return be(t.events, R + 1, 0, t.events.slice(I)), t.events.length = z, l(w);
    }
    return a(w);
  }
  function l(w) {
    if (r === n.length) {
      if (!i)
        return d(w);
      if (i.currentConstruct && i.currentConstruct.concrete)
        return p(w);
      t.interrupt = !!(i.currentConstruct && !i._gfmTableDynamicInterruptHack);
    }
    return t.containerState = {}, e.check(ai, f, c)(w);
  }
  function f(w) {
    return i && S(), b(r), d(w);
  }
  function c(w) {
    return t.parser.lazy[t.now().line] = r !== n.length, o = t.now().offset, p(w);
  }
  function d(w) {
    return t.containerState = {}, e.attempt(ai, h, p)(w);
  }
  function h(w) {
    return r++, n.push([t.currentConstruct, t.containerState]), d(w);
  }
  function p(w) {
    if (w === null) {
      i && S(), b(0), e.consume(w);
      return;
    }
    return i = i || t.parser.flow(t.now()), e.enter("chunkFlow", {
      _tokenizer: i,
      contentType: "flow",
      previous: s
    }), g(w);
  }
  function g(w) {
    if (w === null) {
      k(e.exit("chunkFlow"), !0), b(0), e.consume(w);
      return;
    }
    return M(w) ? (e.consume(w), k(e.exit("chunkFlow")), r = 0, t.interrupt = void 0, a) : (e.consume(w), g);
  }
  function k(w, I) {
    const R = t.sliceStream(w);
    if (I && R.push(null), w.previous = s, s && (s.next = w), s = w, i.defineSkip(w.start), i.write(R), t.parser.lazy[w.start.line]) {
      let C = i.events.length;
      for (; C--; )
        if (
          // The token starts before the line ending…
          i.events[C][1].start.offset < o && // …and either is not ended yet…
          (!i.events[C][1].end || // …or ends after it.
          i.events[C][1].end.offset > o)
        )
          return;
      const z = t.events.length;
      let V = z, _, v;
      for (; V--; )
        if (t.events[V][0] === "exit" && t.events[V][1].type === "chunkFlow") {
          if (_) {
            v = t.events[V][1].end;
            break;
          }
          _ = !0;
        }
      for (b(r), C = z; C < t.events.length; )
        t.events[C][1].end = {
          ...v
        }, C++;
      be(t.events, V + 1, 0, t.events.slice(z)), t.events.length = C;
    }
  }
  function b(w) {
    let I = n.length;
    for (; I-- > w; ) {
      const R = n[I];
      t.containerState = R[1], R[0].exit.call(t, e);
    }
    n.length = w;
  }
  function S() {
    i.write([null]), s = void 0, i = void 0, t.containerState._closeFlow = void 0;
  }
}
function jl(e, t, n) {
  return K(e, e.attempt(this.parser.constructs.document, t, n), "linePrefix", this.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4);
}
function st(e) {
  if (e === null || X(e) || We(e))
    return 1;
  if (Jt(e))
    return 2;
}
function Yt(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; ) {
    const s = e[i].resolveAll;
    s && !r.includes(s) && (t = s(t, n), r.push(s));
  }
  return t;
}
const $n = {
  name: "attention",
  resolveAll: $l,
  tokenize: Bl
};
function $l(e, t) {
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
          }, d = {
            ...e[n][1].start
          };
          li(c, -u), li(d, u), o = {
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
            end: d
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
          }, l = [], e[r][1].end.offset - e[r][1].start.offset && (l = xe(l, [["enter", e[r][1], t], ["exit", e[r][1], t]])), l = xe(l, [["enter", i, t], ["enter", o, t], ["exit", o, t], ["enter", s, t]]), l = xe(l, Yt(t.parser.constructs.insideSpan.null, e.slice(r + 1, n), t)), l = xe(l, [["exit", s, t], ["enter", a, t], ["exit", a, t], ["exit", i, t]]), e[n][1].end.offset - e[n][1].start.offset ? (f = 2, l = xe(l, [["enter", e[n][1], t], ["exit", e[n][1], t]])) : f = 0, be(e, r - 1, n - r + 3, l), n = r + l.length - f - 2;
          break;
        }
    }
  for (n = -1; ++n < e.length; )
    e[n][1].type === "attentionSequence" && (e[n][1].type = "data");
  return e;
}
function Bl(e, t) {
  const n = this.parser.constructs.attentionMarkers.null, r = this.previous, i = st(r);
  let s;
  return o;
  function o(u) {
    return s = u, e.enter("attentionSequence"), a(u);
  }
  function a(u) {
    if (u === s)
      return e.consume(u), a;
    const l = e.exit("attentionSequence"), f = st(u), c = !f || f === 2 && i || n.includes(u), d = !i || i === 2 && f || n.includes(r);
    return l._open = !!(s === 42 ? c : c && (i || !d)), l._close = !!(s === 42 ? d : d && (f || !c)), t(u);
  }
}
function li(e, t) {
  e.column += t, e.offset += t, e._bufferIndex += t;
}
const Vl = {
  name: "autolink",
  tokenize: Hl
};
function Hl(e, t, n) {
  let r = 0;
  return i;
  function i(h) {
    return e.enter("autolink"), e.enter("autolinkMarker"), e.consume(h), e.exit("autolinkMarker"), e.enter("autolinkProtocol"), s;
  }
  function s(h) {
    return ce(h) ? (e.consume(h), o) : h === 64 ? n(h) : l(h);
  }
  function o(h) {
    return h === 43 || h === 45 || h === 46 || le(h) ? (r = 1, a(h)) : l(h);
  }
  function a(h) {
    return h === 58 ? (e.consume(h), r = 0, u) : (h === 43 || h === 45 || h === 46 || le(h)) && r++ < 32 ? (e.consume(h), a) : (r = 0, l(h));
  }
  function u(h) {
    return h === 62 ? (e.exit("autolinkProtocol"), e.enter("autolinkMarker"), e.consume(h), e.exit("autolinkMarker"), e.exit("autolink"), t) : h === null || h === 32 || h === 60 || Ht(h) ? n(h) : (e.consume(h), u);
  }
  function l(h) {
    return h === 64 ? (e.consume(h), f) : Ol(h) ? (e.consume(h), l) : n(h);
  }
  function f(h) {
    return le(h) ? c(h) : n(h);
  }
  function c(h) {
    return h === 46 ? (e.consume(h), r = 0, f) : h === 62 ? (e.exit("autolinkProtocol").type = "autolinkEmail", e.enter("autolinkMarker"), e.consume(h), e.exit("autolinkMarker"), e.exit("autolink"), t) : d(h);
  }
  function d(h) {
    if ((h === 45 || le(h)) && r++ < 63) {
      const p = h === 45 ? d : c;
      return e.consume(h), p;
    }
    return n(h);
  }
}
const Nt = {
  partial: !0,
  tokenize: Ul
};
function Ul(e, t, n) {
  return r;
  function r(s) {
    return U(s) ? K(e, i, "linePrefix")(s) : i(s);
  }
  function i(s) {
    return s === null || M(s) ? t(s) : n(s);
  }
}
const Ss = {
  continuation: {
    tokenize: Kl
  },
  exit: Wl,
  name: "blockQuote",
  tokenize: ql
};
function ql(e, t, n) {
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
    return U(o) ? (e.enter("blockQuotePrefixWhitespace"), e.consume(o), e.exit("blockQuotePrefixWhitespace"), e.exit("blockQuotePrefix"), t) : (e.exit("blockQuotePrefix"), t(o));
  }
}
function Kl(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return U(o) ? K(e, s, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(o) : s(o);
  }
  function s(o) {
    return e.attempt(Ss, t, n)(o);
  }
}
function Wl(e) {
  e.exit("blockQuote");
}
const Cs = {
  name: "characterEscape",
  tokenize: Gl
};
function Gl(e, t, n) {
  return r;
  function r(s) {
    return e.enter("characterEscape"), e.enter("escapeMarker"), e.consume(s), e.exit("escapeMarker"), i;
  }
  function i(s) {
    return _l(s) ? (e.enter("characterEscapeValue"), e.consume(s), e.exit("characterEscapeValue"), e.exit("characterEscape"), t) : n(s);
  }
}
const Es = {
  name: "characterReference",
  tokenize: Jl
};
function Jl(e, t, n) {
  const r = this;
  let i = 0, s, o;
  return a;
  function a(c) {
    return e.enter("characterReference"), e.enter("characterReferenceMarker"), e.consume(c), e.exit("characterReferenceMarker"), u;
  }
  function u(c) {
    return c === 35 ? (e.enter("characterReferenceMarkerNumeric"), e.consume(c), e.exit("characterReferenceMarkerNumeric"), l) : (e.enter("characterReferenceValue"), s = 31, o = le, f(c));
  }
  function l(c) {
    return c === 88 || c === 120 ? (e.enter("characterReferenceMarkerHexadecimal"), e.consume(c), e.exit("characterReferenceMarkerHexadecimal"), e.enter("characterReferenceValue"), s = 6, o = Pl, f) : (e.enter("characterReferenceValue"), s = 7, o = jn, f(c));
  }
  function f(c) {
    if (c === 59 && i) {
      const d = e.exit("characterReferenceValue");
      return o === le && !or(r.sliceSerialize(d)) ? n(c) : (e.enter("characterReferenceMarker"), e.consume(c), e.exit("characterReferenceMarker"), e.exit("characterReference"), t);
    }
    return o(c) && i++ < s ? (e.consume(c), f) : n(c);
  }
}
const ui = {
  partial: !0,
  tokenize: Ql
}, ci = {
  concrete: !0,
  name: "codeFenced",
  tokenize: Yl
};
function Yl(e, t, n) {
  const r = this, i = {
    partial: !0,
    tokenize: R
  };
  let s = 0, o = 0, a;
  return u;
  function u(C) {
    return l(C);
  }
  function l(C) {
    const z = r.events[r.events.length - 1];
    return s = z && z[1].type === "linePrefix" ? z[2].sliceSerialize(z[1], !0).length : 0, a = C, e.enter("codeFenced"), e.enter("codeFencedFence"), e.enter("codeFencedFenceSequence"), f(C);
  }
  function f(C) {
    return C === a ? (o++, e.consume(C), f) : o < 3 ? n(C) : (e.exit("codeFencedFenceSequence"), U(C) ? K(e, c, "whitespace")(C) : c(C));
  }
  function c(C) {
    return C === null || M(C) ? (e.exit("codeFencedFence"), r.interrupt ? t(C) : e.check(ui, g, I)(C)) : (e.enter("codeFencedFenceInfo"), e.enter("chunkString", {
      contentType: "string"
    }), d(C));
  }
  function d(C) {
    return C === null || M(C) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), c(C)) : U(C) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), K(e, h, "whitespace")(C)) : C === 96 && C === a ? n(C) : (e.consume(C), d);
  }
  function h(C) {
    return C === null || M(C) ? c(C) : (e.enter("codeFencedFenceMeta"), e.enter("chunkString", {
      contentType: "string"
    }), p(C));
  }
  function p(C) {
    return C === null || M(C) ? (e.exit("chunkString"), e.exit("codeFencedFenceMeta"), c(C)) : C === 96 && C === a ? n(C) : (e.consume(C), p);
  }
  function g(C) {
    return e.attempt(i, I, k)(C);
  }
  function k(C) {
    return e.enter("lineEnding"), e.consume(C), e.exit("lineEnding"), b;
  }
  function b(C) {
    return s > 0 && U(C) ? K(e, S, "linePrefix", s + 1)(C) : S(C);
  }
  function S(C) {
    return C === null || M(C) ? e.check(ui, g, I)(C) : (e.enter("codeFlowValue"), w(C));
  }
  function w(C) {
    return C === null || M(C) ? (e.exit("codeFlowValue"), S(C)) : (e.consume(C), w);
  }
  function I(C) {
    return e.exit("codeFenced"), t(C);
  }
  function R(C, z, V) {
    let _ = 0;
    return v;
    function v(O) {
      return C.enter("lineEnding"), C.consume(O), C.exit("lineEnding"), N;
    }
    function N(O) {
      return C.enter("codeFencedFence"), U(O) ? K(C, L, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(O) : L(O);
    }
    function L(O) {
      return O === a ? (C.enter("codeFencedFenceSequence"), F(O)) : V(O);
    }
    function F(O) {
      return O === a ? (_++, C.consume(O), F) : _ >= o ? (C.exit("codeFencedFenceSequence"), U(O) ? K(C, D, "whitespace")(O) : D(O)) : V(O);
    }
    function D(O) {
      return O === null || M(O) ? (C.exit("codeFencedFence"), z(O)) : V(O);
    }
  }
}
function Ql(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return o === null ? n(o) : (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), s);
  }
  function s(o) {
    return r.parser.lazy[r.now().line] ? n(o) : t(o);
  }
}
const dn = {
  name: "codeIndented",
  tokenize: Zl
}, Xl = {
  partial: !0,
  tokenize: eu
};
function Zl(e, t, n) {
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
    return l === null ? u(l) : M(l) ? e.attempt(Xl, o, u)(l) : (e.enter("codeFlowValue"), a(l));
  }
  function a(l) {
    return l === null || M(l) ? (e.exit("codeFlowValue"), o(l)) : (e.consume(l), a);
  }
  function u(l) {
    return e.exit("codeIndented"), t(l);
  }
}
function eu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return r.parser.lazy[r.now().line] ? n(o) : M(o) ? (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), i) : K(e, s, "linePrefix", 5)(o);
  }
  function s(o) {
    const a = r.events[r.events.length - 1];
    return a && a[1].type === "linePrefix" && a[2].sliceSerialize(a[1], !0).length >= 4 ? t(o) : M(o) ? i(o) : n(o);
  }
}
const tu = {
  name: "codeText",
  previous: ru,
  resolve: nu,
  tokenize: iu
};
function nu(e) {
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
function ru(e) {
  return e !== 96 || this.events[this.events.length - 1][1].type === "characterEscape";
}
function iu(e, t, n) {
  let r = 0, i, s;
  return o;
  function o(c) {
    return e.enter("codeText"), e.enter("codeTextSequence"), a(c);
  }
  function a(c) {
    return c === 96 ? (e.consume(c), r++, a) : (e.exit("codeTextSequence"), u(c));
  }
  function u(c) {
    return c === null ? n(c) : c === 32 ? (e.enter("space"), e.consume(c), e.exit("space"), u) : c === 96 ? (s = e.enter("codeTextSequence"), i = 0, f(c)) : M(c) ? (e.enter("lineEnding"), e.consume(c), e.exit("lineEnding"), u) : (e.enter("codeTextData"), l(c));
  }
  function l(c) {
    return c === null || c === 32 || c === 96 || M(c) ? (e.exit("codeTextData"), u(c)) : (e.consume(c), l);
  }
  function f(c) {
    return c === 96 ? (e.consume(c), i++, f) : i === r ? (e.exit("codeTextSequence"), e.exit("codeText"), t(c)) : (s.type = "codeTextData", l(c));
  }
}
class su {
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
    return r && mt(this.left, r), s.reverse();
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
    this.setCursor(Number.POSITIVE_INFINITY), mt(this.left, t);
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
    this.setCursor(0), mt(this.right, t.reverse());
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
        mt(this.right, n.reverse());
      } else {
        const n = this.right.splice(this.left.length + this.right.length - t, Number.POSITIVE_INFINITY);
        mt(this.left, n.reverse());
      }
  }
}
function mt(e, t) {
  let n = 0;
  if (t.length < 1e4)
    e.push(...t);
  else
    for (; n < t.length; )
      e.push(...t.slice(n, n + 1e4)), n += 1e4;
}
function Is(e) {
  const t = {};
  let n = -1, r, i, s, o, a, u, l;
  const f = new su(e);
  for (; ++n < f.length; ) {
    for (; n in t; )
      n = t[n];
    if (r = f.get(n), n && r[1].type === "chunkFlow" && f.get(n - 1)[1].type === "listItemPrefix" && (u = r[1]._tokenizer.events, s = 0, s < u.length && u[s][1].type === "lineEndingBlank" && (s += 2), s < u.length && u[s][1].type === "content"))
      for (; ++s < u.length && u[s][1].type !== "content"; )
        u[s][1].type === "chunkText" && (u[s][1]._isInFirstContentOfListItem = !0, s++);
    if (r[0] === "enter")
      r[1].contentType && (Object.assign(t, ou(f, n)), n = t[n], l = !0);
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
  return be(e, 0, Number.POSITIVE_INFINITY, f.slice(0)), !l;
}
function ou(e, t) {
  const n = e.get(t)[1], r = e.get(t)[2];
  let i = t - 1;
  const s = [];
  let o = n._tokenizer;
  o || (o = r.parser[n.contentType](n.start), n._contentTypeTextTrailing && (o._contentTypeTextTrailing = !0));
  const a = o.events, u = [], l = {};
  let f, c, d = -1, h = n, p = 0, g = 0;
  const k = [g];
  for (; h; ) {
    for (; e.get(++i)[1] !== h; )
      ;
    s.push(i), h._tokenizer || (f = r.sliceStream(h), h.next || f.push(null), c && o.defineSkip(h.start), h._isInFirstContentOfListItem && (o._gfmTasklistFirstContentOfListItem = !0), o.write(f), h._isInFirstContentOfListItem && (o._gfmTasklistFirstContentOfListItem = void 0)), c = h, h = h.next;
  }
  for (h = n; ++d < a.length; )
    // Find a void token that includes a break.
    a[d][0] === "exit" && a[d - 1][0] === "enter" && a[d][1].type === a[d - 1][1].type && a[d][1].start.line !== a[d][1].end.line && (g = d + 1, k.push(g), h._tokenizer = void 0, h.previous = void 0, h = h.next);
  for (o.events = [], h ? (h._tokenizer = void 0, h.previous = void 0) : k.pop(), d = k.length; d--; ) {
    const b = a.slice(k[d], k[d + 1]), S = s.pop();
    u.push([S, S + b.length - 1]), e.splice(S, 2, b);
  }
  for (u.reverse(), d = -1; ++d < u.length; )
    l[p + u[d][0]] = p + u[d][1], p += u[d][1] - u[d][0] - 1;
  return l;
}
const au = {
  resolve: uu,
  tokenize: cu
}, lu = {
  partial: !0,
  tokenize: fu
};
function uu(e) {
  return Is(e), e;
}
function cu(e, t) {
  let n;
  return r;
  function r(a) {
    return e.enter("content"), n = e.enter("chunkContent", {
      contentType: "content"
    }), i(a);
  }
  function i(a) {
    return a === null ? s(a) : M(a) ? e.check(lu, o, s)(a) : (e.consume(a), i);
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
function fu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return e.exit("chunkContent"), e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), K(e, s, "linePrefix");
  }
  function s(o) {
    if (o === null || M(o))
      return n(o);
    const a = r.events[r.events.length - 1];
    return !r.parser.constructs.disable.null.includes("codeIndented") && a && a[1].type === "linePrefix" && a[2].sliceSerialize(a[1], !0).length >= 4 ? t(o) : e.interrupt(r.parser.constructs.flow, n, t)(o);
  }
}
function Ts(e, t, n, r, i, s, o, a, u) {
  const l = u || Number.POSITIVE_INFINITY;
  let f = 0;
  return c;
  function c(b) {
    return b === 60 ? (e.enter(r), e.enter(i), e.enter(s), e.consume(b), e.exit(s), d) : b === null || b === 32 || b === 41 || Ht(b) ? n(b) : (e.enter(r), e.enter(o), e.enter(a), e.enter("chunkString", {
      contentType: "string"
    }), g(b));
  }
  function d(b) {
    return b === 62 ? (e.enter(s), e.consume(b), e.exit(s), e.exit(i), e.exit(r), t) : (e.enter(a), e.enter("chunkString", {
      contentType: "string"
    }), h(b));
  }
  function h(b) {
    return b === 62 ? (e.exit("chunkString"), e.exit(a), d(b)) : b === null || b === 60 || M(b) ? n(b) : (e.consume(b), b === 92 ? p : h);
  }
  function p(b) {
    return b === 60 || b === 62 || b === 92 ? (e.consume(b), h) : h(b);
  }
  function g(b) {
    return !f && (b === null || b === 41 || X(b)) ? (e.exit("chunkString"), e.exit(a), e.exit(o), e.exit(r), t(b)) : f < l && b === 40 ? (e.consume(b), f++, g) : b === 41 ? (e.consume(b), f--, g) : b === null || b === 32 || b === 40 || Ht(b) ? n(b) : (e.consume(b), b === 92 ? k : g);
  }
  function k(b) {
    return b === 40 || b === 41 || b === 92 ? (e.consume(b), g) : g(b);
  }
}
function Ns(e, t, n, r, i, s) {
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
    h === 94 && !a && "_hiddenFootnoteSupport" in o.parser.constructs ? n(h) : h === 93 ? (e.exit(s), e.enter(i), e.consume(h), e.exit(i), e.exit(r), t) : M(h) ? (e.enter("lineEnding"), e.consume(h), e.exit("lineEnding"), f) : (e.enter("chunkString", {
      contentType: "string"
    }), c(h));
  }
  function c(h) {
    return h === null || h === 91 || h === 93 || M(h) || a++ > 999 ? (e.exit("chunkString"), f(h)) : (e.consume(h), u || (u = !U(h)), h === 92 ? d : c);
  }
  function d(h) {
    return h === 91 || h === 92 || h === 93 ? (e.consume(h), a++, c) : c(h);
  }
}
function Ls(e, t, n, r, i, s) {
  let o;
  return a;
  function a(d) {
    return d === 34 || d === 39 || d === 40 ? (e.enter(r), e.enter(i), e.consume(d), e.exit(i), o = d === 40 ? 41 : d, u) : n(d);
  }
  function u(d) {
    return d === o ? (e.enter(i), e.consume(d), e.exit(i), e.exit(r), t) : (e.enter(s), l(d));
  }
  function l(d) {
    return d === o ? (e.exit(s), u(o)) : d === null ? n(d) : M(d) ? (e.enter("lineEnding"), e.consume(d), e.exit("lineEnding"), K(e, l, "linePrefix")) : (e.enter("chunkString", {
      contentType: "string"
    }), f(d));
  }
  function f(d) {
    return d === o || d === null || M(d) ? (e.exit("chunkString"), l(d)) : (e.consume(d), d === 92 ? c : f);
  }
  function c(d) {
    return d === o || d === 92 ? (e.consume(d), f) : f(d);
  }
}
function vt(e, t) {
  let n;
  return r;
  function r(i) {
    return M(i) ? (e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), n = !0, r) : U(i) ? K(e, r, n ? "linePrefix" : "lineSuffix")(i) : t(i);
  }
}
const hu = {
  name: "definition",
  tokenize: pu
}, du = {
  partial: !0,
  tokenize: gu
};
function pu(e, t, n) {
  const r = this;
  let i;
  return s;
  function s(h) {
    return e.enter("definition"), o(h);
  }
  function o(h) {
    return Ns.call(
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
    return i = Ee(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1)), h === 58 ? (e.enter("definitionMarker"), e.consume(h), e.exit("definitionMarker"), u) : n(h);
  }
  function u(h) {
    return X(h) ? vt(e, l)(h) : l(h);
  }
  function l(h) {
    return Ts(
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
    return e.attempt(du, c, c)(h);
  }
  function c(h) {
    return U(h) ? K(e, d, "whitespace")(h) : d(h);
  }
  function d(h) {
    return h === null || M(h) ? (e.exit("definition"), r.parser.defined.push(i), t(h)) : n(h);
  }
}
function gu(e, t, n) {
  return r;
  function r(a) {
    return X(a) ? vt(e, i)(a) : n(a);
  }
  function i(a) {
    return Ls(e, s, n, "definitionTitle", "definitionTitleMarker", "definitionTitleString")(a);
  }
  function s(a) {
    return U(a) ? K(e, o, "whitespace")(a) : o(a);
  }
  function o(a) {
    return a === null || M(a) ? t(a) : n(a);
  }
}
const mu = {
  name: "hardBreakEscape",
  tokenize: yu
};
function yu(e, t, n) {
  return r;
  function r(s) {
    return e.enter("hardBreakEscape"), e.consume(s), i;
  }
  function i(s) {
    return M(s) ? (e.exit("hardBreakEscape"), t(s)) : n(s);
  }
}
const bu = {
  name: "headingAtx",
  resolve: xu,
  tokenize: ku
};
function xu(e, t) {
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
  }, be(e, r, n - r + 1, [["enter", i, t], ["enter", s, t], ["exit", s, t], ["exit", i, t]])), e;
}
function ku(e, t, n) {
  let r = 0;
  return i;
  function i(f) {
    return e.enter("atxHeading"), s(f);
  }
  function s(f) {
    return e.enter("atxHeadingSequence"), o(f);
  }
  function o(f) {
    return f === 35 && r++ < 6 ? (e.consume(f), o) : f === null || X(f) ? (e.exit("atxHeadingSequence"), a(f)) : n(f);
  }
  function a(f) {
    return f === 35 ? (e.enter("atxHeadingSequence"), u(f)) : f === null || M(f) ? (e.exit("atxHeading"), t(f)) : U(f) ? K(e, a, "whitespace")(f) : (e.enter("atxHeadingText"), l(f));
  }
  function u(f) {
    return f === 35 ? (e.consume(f), u) : (e.exit("atxHeadingSequence"), a(f));
  }
  function l(f) {
    return f === null || f === 35 || X(f) ? (e.exit("atxHeadingText"), a(f)) : (e.consume(f), l);
  }
}
const wu = [
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
], fi = ["pre", "script", "style", "textarea"], vu = {
  concrete: !0,
  name: "htmlFlow",
  resolveTo: Eu,
  tokenize: Iu
}, Su = {
  partial: !0,
  tokenize: Nu
}, Cu = {
  partial: !0,
  tokenize: Tu
};
function Eu(e) {
  let t = e.length;
  for (; t-- && !(e[t][0] === "enter" && e[t][1].type === "htmlFlow"); )
    ;
  return t > 1 && e[t - 2][1].type === "linePrefix" && (e[t][1].start = e[t - 2][1].start, e[t + 1][1].start = e[t - 2][1].start, e.splice(t - 2, 2)), e;
}
function Iu(e, t, n) {
  const r = this;
  let i, s, o, a, u;
  return l;
  function l(y) {
    return f(y);
  }
  function f(y) {
    return e.enter("htmlFlow"), e.enter("htmlFlowData"), e.consume(y), c;
  }
  function c(y) {
    return y === 33 ? (e.consume(y), d) : y === 47 ? (e.consume(y), s = !0, g) : y === 63 ? (e.consume(y), i = 3, r.interrupt ? t : m) : ce(y) ? (e.consume(y), o = String.fromCharCode(y), k) : n(y);
  }
  function d(y) {
    return y === 45 ? (e.consume(y), i = 2, h) : y === 91 ? (e.consume(y), i = 5, a = 0, p) : ce(y) ? (e.consume(y), i = 4, r.interrupt ? t : m) : n(y);
  }
  function h(y) {
    return y === 45 ? (e.consume(y), r.interrupt ? t : m) : n(y);
  }
  function p(y) {
    const de = "CDATA[";
    return y === de.charCodeAt(a++) ? (e.consume(y), a === de.length ? r.interrupt ? t : L : p) : n(y);
  }
  function g(y) {
    return ce(y) ? (e.consume(y), o = String.fromCharCode(y), k) : n(y);
  }
  function k(y) {
    if (y === null || y === 47 || y === 62 || X(y)) {
      const de = y === 47, $e = o.toLowerCase();
      return !de && !s && fi.includes($e) ? (i = 1, r.interrupt ? t(y) : L(y)) : wu.includes(o.toLowerCase()) ? (i = 6, de ? (e.consume(y), b) : r.interrupt ? t(y) : L(y)) : (i = 7, r.interrupt && !r.parser.lazy[r.now().line] ? n(y) : s ? S(y) : w(y));
    }
    return y === 45 || le(y) ? (e.consume(y), o += String.fromCharCode(y), k) : n(y);
  }
  function b(y) {
    return y === 62 ? (e.consume(y), r.interrupt ? t : L) : n(y);
  }
  function S(y) {
    return U(y) ? (e.consume(y), S) : v(y);
  }
  function w(y) {
    return y === 47 ? (e.consume(y), v) : y === 58 || y === 95 || ce(y) ? (e.consume(y), I) : U(y) ? (e.consume(y), w) : v(y);
  }
  function I(y) {
    return y === 45 || y === 46 || y === 58 || y === 95 || le(y) ? (e.consume(y), I) : R(y);
  }
  function R(y) {
    return y === 61 ? (e.consume(y), C) : U(y) ? (e.consume(y), R) : w(y);
  }
  function C(y) {
    return y === null || y === 60 || y === 61 || y === 62 || y === 96 ? n(y) : y === 34 || y === 39 ? (e.consume(y), u = y, z) : U(y) ? (e.consume(y), C) : V(y);
  }
  function z(y) {
    return y === u ? (e.consume(y), u = null, _) : y === null || M(y) ? n(y) : (e.consume(y), z);
  }
  function V(y) {
    return y === null || y === 34 || y === 39 || y === 47 || y === 60 || y === 61 || y === 62 || y === 96 || X(y) ? R(y) : (e.consume(y), V);
  }
  function _(y) {
    return y === 47 || y === 62 || U(y) ? w(y) : n(y);
  }
  function v(y) {
    return y === 62 ? (e.consume(y), N) : n(y);
  }
  function N(y) {
    return y === null || M(y) ? L(y) : U(y) ? (e.consume(y), N) : n(y);
  }
  function L(y) {
    return y === 45 && i === 2 ? (e.consume(y), H) : y === 60 && i === 1 ? (e.consume(y), W) : y === 62 && i === 4 ? (e.consume(y), Z) : y === 63 && i === 3 ? (e.consume(y), m) : y === 93 && i === 5 ? (e.consume(y), he) : M(y) && (i === 6 || i === 7) ? (e.exit("htmlFlowData"), e.check(Su, se, F)(y)) : y === null || M(y) ? (e.exit("htmlFlowData"), F(y)) : (e.consume(y), L);
  }
  function F(y) {
    return e.check(Cu, D, se)(y);
  }
  function D(y) {
    return e.enter("lineEnding"), e.consume(y), e.exit("lineEnding"), O;
  }
  function O(y) {
    return y === null || M(y) ? F(y) : (e.enter("htmlFlowData"), L(y));
  }
  function H(y) {
    return y === 45 ? (e.consume(y), m) : L(y);
  }
  function W(y) {
    return y === 47 ? (e.consume(y), o = "", ie) : L(y);
  }
  function ie(y) {
    if (y === 62) {
      const de = o.toLowerCase();
      return fi.includes(de) ? (e.consume(y), Z) : L(y);
    }
    return ce(y) && o.length < 8 ? (e.consume(y), o += String.fromCharCode(y), ie) : L(y);
  }
  function he(y) {
    return y === 93 ? (e.consume(y), m) : L(y);
  }
  function m(y) {
    return y === 62 ? (e.consume(y), Z) : y === 45 && i === 2 ? (e.consume(y), m) : L(y);
  }
  function Z(y) {
    return y === null || M(y) ? (e.exit("htmlFlowData"), se(y)) : (e.consume(y), Z);
  }
  function se(y) {
    return e.exit("htmlFlow"), t(y);
  }
}
function Tu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return M(o) ? (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), s) : n(o);
  }
  function s(o) {
    return r.parser.lazy[r.now().line] ? n(o) : t(o);
  }
}
function Nu(e, t, n) {
  return r;
  function r(i) {
    return e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), e.attempt(Nt, t, n);
  }
}
const Lu = {
  name: "htmlText",
  tokenize: Au
};
function Au(e, t, n) {
  const r = this;
  let i, s, o;
  return a;
  function a(m) {
    return e.enter("htmlText"), e.enter("htmlTextData"), e.consume(m), u;
  }
  function u(m) {
    return m === 33 ? (e.consume(m), l) : m === 47 ? (e.consume(m), R) : m === 63 ? (e.consume(m), w) : ce(m) ? (e.consume(m), V) : n(m);
  }
  function l(m) {
    return m === 45 ? (e.consume(m), f) : m === 91 ? (e.consume(m), s = 0, p) : ce(m) ? (e.consume(m), S) : n(m);
  }
  function f(m) {
    return m === 45 ? (e.consume(m), h) : n(m);
  }
  function c(m) {
    return m === null ? n(m) : m === 45 ? (e.consume(m), d) : M(m) ? (o = c, W(m)) : (e.consume(m), c);
  }
  function d(m) {
    return m === 45 ? (e.consume(m), h) : c(m);
  }
  function h(m) {
    return m === 62 ? H(m) : m === 45 ? d(m) : c(m);
  }
  function p(m) {
    const Z = "CDATA[";
    return m === Z.charCodeAt(s++) ? (e.consume(m), s === Z.length ? g : p) : n(m);
  }
  function g(m) {
    return m === null ? n(m) : m === 93 ? (e.consume(m), k) : M(m) ? (o = g, W(m)) : (e.consume(m), g);
  }
  function k(m) {
    return m === 93 ? (e.consume(m), b) : g(m);
  }
  function b(m) {
    return m === 62 ? H(m) : m === 93 ? (e.consume(m), b) : g(m);
  }
  function S(m) {
    return m === null || m === 62 ? H(m) : M(m) ? (o = S, W(m)) : (e.consume(m), S);
  }
  function w(m) {
    return m === null ? n(m) : m === 63 ? (e.consume(m), I) : M(m) ? (o = w, W(m)) : (e.consume(m), w);
  }
  function I(m) {
    return m === 62 ? H(m) : w(m);
  }
  function R(m) {
    return ce(m) ? (e.consume(m), C) : n(m);
  }
  function C(m) {
    return m === 45 || le(m) ? (e.consume(m), C) : z(m);
  }
  function z(m) {
    return M(m) ? (o = z, W(m)) : U(m) ? (e.consume(m), z) : H(m);
  }
  function V(m) {
    return m === 45 || le(m) ? (e.consume(m), V) : m === 47 || m === 62 || X(m) ? _(m) : n(m);
  }
  function _(m) {
    return m === 47 ? (e.consume(m), H) : m === 58 || m === 95 || ce(m) ? (e.consume(m), v) : M(m) ? (o = _, W(m)) : U(m) ? (e.consume(m), _) : H(m);
  }
  function v(m) {
    return m === 45 || m === 46 || m === 58 || m === 95 || le(m) ? (e.consume(m), v) : N(m);
  }
  function N(m) {
    return m === 61 ? (e.consume(m), L) : M(m) ? (o = N, W(m)) : U(m) ? (e.consume(m), N) : _(m);
  }
  function L(m) {
    return m === null || m === 60 || m === 61 || m === 62 || m === 96 ? n(m) : m === 34 || m === 39 ? (e.consume(m), i = m, F) : M(m) ? (o = L, W(m)) : U(m) ? (e.consume(m), L) : (e.consume(m), D);
  }
  function F(m) {
    return m === i ? (e.consume(m), i = void 0, O) : m === null ? n(m) : M(m) ? (o = F, W(m)) : (e.consume(m), F);
  }
  function D(m) {
    return m === null || m === 34 || m === 39 || m === 60 || m === 61 || m === 96 ? n(m) : m === 47 || m === 62 || X(m) ? _(m) : (e.consume(m), D);
  }
  function O(m) {
    return m === 47 || m === 62 || X(m) ? _(m) : n(m);
  }
  function H(m) {
    return m === 62 ? (e.consume(m), e.exit("htmlTextData"), e.exit("htmlText"), t) : n(m);
  }
  function W(m) {
    return e.exit("htmlTextData"), e.enter("lineEnding"), e.consume(m), e.exit("lineEnding"), ie;
  }
  function ie(m) {
    return U(m) ? K(e, he, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(m) : he(m);
  }
  function he(m) {
    return e.enter("htmlTextData"), o(m);
  }
}
const ar = {
  name: "labelEnd",
  resolveAll: _u,
  resolveTo: Du,
  tokenize: Fu
}, Ru = {
  tokenize: Mu
}, Ou = {
  tokenize: zu
}, Pu = {
  tokenize: ju
};
function _u(e) {
  let t = -1;
  const n = [];
  for (; ++t < e.length; ) {
    const r = e[t][1];
    if (n.push(e[t]), r.type === "labelImage" || r.type === "labelLink" || r.type === "labelEnd") {
      const i = r.type === "labelImage" ? 4 : 2;
      r.type = "data", t += i;
    }
  }
  return e.length !== n.length && be(e, 0, e.length, n), e;
}
function Du(e, t) {
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
  return a = [["enter", u, t], ["enter", l, t]], a = xe(a, e.slice(s + 1, s + r + 3)), a = xe(a, [["enter", f, t]]), a = xe(a, Yt(t.parser.constructs.insideSpan.null, e.slice(s + r + 4, o - 3), t)), a = xe(a, [["exit", f, t], e[o - 2], e[o - 1], ["exit", l, t]]), a = xe(a, e.slice(o + 1)), a = xe(a, [["exit", u, t]]), be(e, s, e.length, a), e;
}
function Fu(e, t, n) {
  const r = this;
  let i = r.events.length, s, o;
  for (; i--; )
    if ((r.events[i][1].type === "labelImage" || r.events[i][1].type === "labelLink") && !r.events[i][1]._balanced) {
      s = r.events[i][1];
      break;
    }
  return a;
  function a(d) {
    return s ? s._inactive ? c(d) : (o = r.parser.defined.includes(Ee(r.sliceSerialize({
      start: s.end,
      end: r.now()
    }))), e.enter("labelEnd"), e.enter("labelMarker"), e.consume(d), e.exit("labelMarker"), e.exit("labelEnd"), u) : n(d);
  }
  function u(d) {
    return d === 40 ? e.attempt(Ru, f, o ? f : c)(d) : d === 91 ? e.attempt(Ou, f, o ? l : c)(d) : o ? f(d) : c(d);
  }
  function l(d) {
    return e.attempt(Pu, f, c)(d);
  }
  function f(d) {
    return t(d);
  }
  function c(d) {
    return s._balanced = !0, n(d);
  }
}
function Mu(e, t, n) {
  return r;
  function r(c) {
    return e.enter("resource"), e.enter("resourceMarker"), e.consume(c), e.exit("resourceMarker"), i;
  }
  function i(c) {
    return X(c) ? vt(e, s)(c) : s(c);
  }
  function s(c) {
    return c === 41 ? f(c) : Ts(e, o, a, "resourceDestination", "resourceDestinationLiteral", "resourceDestinationLiteralMarker", "resourceDestinationRaw", "resourceDestinationString", 32)(c);
  }
  function o(c) {
    return X(c) ? vt(e, u)(c) : f(c);
  }
  function a(c) {
    return n(c);
  }
  function u(c) {
    return c === 34 || c === 39 || c === 40 ? Ls(e, l, n, "resourceTitle", "resourceTitleMarker", "resourceTitleString")(c) : f(c);
  }
  function l(c) {
    return X(c) ? vt(e, f)(c) : f(c);
  }
  function f(c) {
    return c === 41 ? (e.enter("resourceMarker"), e.consume(c), e.exit("resourceMarker"), e.exit("resource"), t) : n(c);
  }
}
function zu(e, t, n) {
  const r = this;
  return i;
  function i(a) {
    return Ns.call(r, e, s, o, "reference", "referenceMarker", "referenceString")(a);
  }
  function s(a) {
    return r.parser.defined.includes(Ee(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1))) ? t(a) : n(a);
  }
  function o(a) {
    return n(a);
  }
}
function ju(e, t, n) {
  return r;
  function r(s) {
    return e.enter("reference"), e.enter("referenceMarker"), e.consume(s), e.exit("referenceMarker"), i;
  }
  function i(s) {
    return s === 93 ? (e.enter("referenceMarker"), e.consume(s), e.exit("referenceMarker"), e.exit("reference"), t) : n(s);
  }
}
const $u = {
  name: "labelStartImage",
  resolveAll: ar.resolveAll,
  tokenize: Bu
};
function Bu(e, t, n) {
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
const Vu = {
  name: "labelStartLink",
  resolveAll: ar.resolveAll,
  tokenize: Hu
};
function Hu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return e.enter("labelLink"), e.enter("labelMarker"), e.consume(o), e.exit("labelMarker"), e.exit("labelLink"), s;
  }
  function s(o) {
    return o === 94 && "_hiddenFootnoteSupport" in r.parser.constructs ? n(o) : t(o);
  }
}
const pn = {
  name: "lineEnding",
  tokenize: Uu
};
function Uu(e, t) {
  return n;
  function n(r) {
    return e.enter("lineEnding"), e.consume(r), e.exit("lineEnding"), K(e, t, "linePrefix");
  }
}
const jt = {
  name: "thematicBreak",
  tokenize: qu
};
function qu(e, t, n) {
  let r = 0, i;
  return s;
  function s(l) {
    return e.enter("thematicBreak"), o(l);
  }
  function o(l) {
    return i = l, a(l);
  }
  function a(l) {
    return l === i ? (e.enter("thematicBreakSequence"), u(l)) : r >= 3 && (l === null || M(l)) ? (e.exit("thematicBreak"), t(l)) : n(l);
  }
  function u(l) {
    return l === i ? (e.consume(l), r++, u) : (e.exit("thematicBreakSequence"), U(l) ? K(e, a, "whitespace")(l) : a(l));
  }
}
const pe = {
  continuation: {
    tokenize: Ju
  },
  exit: Qu,
  name: "list",
  tokenize: Gu
}, Ku = {
  partial: !0,
  tokenize: Xu
}, Wu = {
  partial: !0,
  tokenize: Yu
};
function Gu(e, t, n) {
  const r = this, i = r.events[r.events.length - 1];
  let s = i && i[1].type === "linePrefix" ? i[2].sliceSerialize(i[1], !0).length : 0, o = 0;
  return a;
  function a(h) {
    const p = r.containerState.type || (h === 42 || h === 43 || h === 45 ? "listUnordered" : "listOrdered");
    if (p === "listUnordered" ? !r.containerState.marker || h === r.containerState.marker : jn(h)) {
      if (r.containerState.type || (r.containerState.type = p, e.enter(p, {
        _container: !0
      })), p === "listUnordered")
        return e.enter("listItemPrefix"), h === 42 || h === 45 ? e.check(jt, n, l)(h) : l(h);
      if (!r.interrupt || h === 49)
        return e.enter("listItemPrefix"), e.enter("listItemValue"), u(h);
    }
    return n(h);
  }
  function u(h) {
    return jn(h) && ++o < 10 ? (e.consume(h), u) : (!r.interrupt || o < 2) && (r.containerState.marker ? h === r.containerState.marker : h === 41 || h === 46) ? (e.exit("listItemValue"), l(h)) : n(h);
  }
  function l(h) {
    return e.enter("listItemMarker"), e.consume(h), e.exit("listItemMarker"), r.containerState.marker = r.containerState.marker || h, e.check(
      Nt,
      // Can’t be empty when interrupting.
      r.interrupt ? n : f,
      e.attempt(Ku, d, c)
    );
  }
  function f(h) {
    return r.containerState.initialBlankLine = !0, s++, d(h);
  }
  function c(h) {
    return U(h) ? (e.enter("listItemPrefixWhitespace"), e.consume(h), e.exit("listItemPrefixWhitespace"), d) : n(h);
  }
  function d(h) {
    return r.containerState.size = s + r.sliceSerialize(e.exit("listItemPrefix"), !0).length, t(h);
  }
}
function Ju(e, t, n) {
  const r = this;
  return r.containerState._closeFlow = void 0, e.check(Nt, i, s);
  function i(a) {
    return r.containerState.furtherBlankLines = r.containerState.furtherBlankLines || r.containerState.initialBlankLine, K(e, t, "listItemIndent", r.containerState.size + 1)(a);
  }
  function s(a) {
    return r.containerState.furtherBlankLines || !U(a) ? (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, o(a)) : (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, e.attempt(Wu, t, o)(a));
  }
  function o(a) {
    return r.containerState._closeFlow = !0, r.interrupt = void 0, K(e, e.attempt(pe, t, n), "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(a);
  }
}
function Yu(e, t, n) {
  const r = this;
  return K(e, i, "listItemIndent", r.containerState.size + 1);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return o && o[1].type === "listItemIndent" && o[2].sliceSerialize(o[1], !0).length === r.containerState.size ? t(s) : n(s);
  }
}
function Qu(e) {
  e.exit(this.containerState.type);
}
function Xu(e, t, n) {
  const r = this;
  return K(e, i, "listItemPrefixWhitespace", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 5);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return !U(s) && o && o[1].type === "listItemPrefixWhitespace" ? t(s) : n(s);
  }
}
const hi = {
  name: "setextUnderline",
  resolveTo: Zu,
  tokenize: ec
};
function Zu(e, t) {
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
function ec(e, t, n) {
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
    return l === i ? (e.consume(l), a) : (e.exit("setextHeadingLineSequence"), U(l) ? K(e, u, "lineSuffix")(l) : u(l));
  }
  function u(l) {
    return l === null || M(l) ? (e.exit("setextHeadingLine"), t(l)) : n(l);
  }
}
const tc = {
  tokenize: nc
};
function nc(e) {
  const t = this, n = e.attempt(
    // Try to parse a blank line.
    Nt,
    r,
    // Try to parse initial flow (essentially, only code).
    e.attempt(this.parser.constructs.flowInitial, i, K(e, e.attempt(this.parser.constructs.flow, i, e.attempt(au, i)), "linePrefix"))
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
const rc = {
  resolveAll: Rs()
}, ic = As("string"), sc = As("text");
function As(e) {
  return {
    resolveAll: Rs(e === "text" ? oc : void 0),
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
      let d = -1;
      if (c)
        for (; ++d < c.length; ) {
          const h = c[d];
          if (!h.previous || h.previous.call(r, r.previous))
            return !0;
        }
      return !1;
    }
  }
}
function Rs(e) {
  return t;
  function t(n, r) {
    let i = -1, s;
    for (; ++i <= n.length; )
      s === void 0 ? n[i] && n[i][1].type === "data" && (s = i, i++) : (!n[i] || n[i][1].type !== "data") && (i !== s + 2 && (n[s][1].end = n[i - 1][1].end, n.splice(s + 2, i - s - 2), i = s + 2), s = void 0);
    return e ? e(n, r) : n;
  }
}
function oc(e, t) {
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
const ac = {
  42: pe,
  43: pe,
  45: pe,
  48: pe,
  49: pe,
  50: pe,
  51: pe,
  52: pe,
  53: pe,
  54: pe,
  55: pe,
  56: pe,
  57: pe,
  62: Ss
}, lc = {
  91: hu
}, uc = {
  [-2]: dn,
  [-1]: dn,
  32: dn
}, cc = {
  35: bu,
  42: jt,
  45: [hi, jt],
  60: vu,
  61: hi,
  95: jt,
  96: ci,
  126: ci
}, fc = {
  38: Es,
  92: Cs
}, hc = {
  [-5]: pn,
  [-4]: pn,
  [-3]: pn,
  33: $u,
  38: Es,
  42: $n,
  60: [Vl, Lu],
  91: Vu,
  92: [mu, Cs],
  93: ar,
  95: $n,
  96: tu
}, dc = {
  null: [$n, rc]
}, pc = {
  null: [42, 95]
}, gc = {
  null: []
}, mc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  attentionMarkers: pc,
  contentInitial: lc,
  disable: gc,
  document: ac,
  flow: cc,
  flowInitial: uc,
  insideSpan: dc,
  string: fc,
  text: hc
}, Symbol.toStringTag, { value: "Module" }));
function yc(e, t, n) {
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
    attempt: z(R),
    check: z(C),
    consume: S,
    enter: w,
    exit: I,
    interrupt: z(C, {
      interrupt: !0
    })
  }, l = {
    code: null,
    containerState: {},
    defineSkip: g,
    events: [],
    now: p,
    parser: e,
    previous: null,
    sliceSerialize: d,
    sliceStream: h,
    write: c
  };
  let f = t.tokenize.call(l, u);
  return t.resolveAll && s.push(t), l;
  function c(N) {
    return o = xe(o, N), k(), o[o.length - 1] !== null ? [] : (V(t, 0), l.events = Yt(s, l.events, l), l.events);
  }
  function d(N, L) {
    return xc(h(N), L);
  }
  function h(N) {
    return bc(o, N);
  }
  function p() {
    const {
      _bufferIndex: N,
      _index: L,
      line: F,
      column: D,
      offset: O
    } = r;
    return {
      _bufferIndex: N,
      _index: L,
      line: F,
      column: D,
      offset: O
    };
  }
  function g(N) {
    i[N.line] = N.column, v();
  }
  function k() {
    let N;
    for (; r._index < o.length; ) {
      const L = o[r._index];
      if (typeof L == "string")
        for (N = r._index, r._bufferIndex < 0 && (r._bufferIndex = 0); r._index === N && r._bufferIndex < L.length; )
          b(L.charCodeAt(r._bufferIndex));
      else
        b(L);
    }
  }
  function b(N) {
    f = f(N);
  }
  function S(N) {
    M(N) ? (r.line++, r.column = 1, r.offset += N === -3 ? 2 : 1, v()) : N !== -1 && (r.column++, r.offset++), r._bufferIndex < 0 ? r._index++ : (r._bufferIndex++, r._bufferIndex === // Points w/ non-negative `_bufferIndex` reference
    // strings.
    /** @type {string} */
    o[r._index].length && (r._bufferIndex = -1, r._index++)), l.previous = N;
  }
  function w(N, L) {
    const F = L || {};
    return F.type = N, F.start = p(), l.events.push(["enter", F, l]), a.push(F), F;
  }
  function I(N) {
    const L = a.pop();
    return L.end = p(), l.events.push(["exit", L, l]), L;
  }
  function R(N, L) {
    V(N, L.from);
  }
  function C(N, L) {
    L.restore();
  }
  function z(N, L) {
    return F;
    function F(D, O, H) {
      let W, ie, he, m;
      return Array.isArray(D) ? (
        /* c8 ignore next 1 */
        se(D)
      ) : "tokenize" in D ? (
        // Looks like a construct.
        se([
          /** @type {Construct} */
          D
        ])
      ) : Z(D);
      function Z(oe) {
        return ut;
        function ut(De) {
          const Qe = De !== null && oe[De], Xe = De !== null && oe.null, At = [
            // To do: add more extension tests.
            /* c8 ignore next 2 */
            ...Array.isArray(Qe) ? Qe : Qe ? [Qe] : [],
            ...Array.isArray(Xe) ? Xe : Xe ? [Xe] : []
          ];
          return se(At)(De);
        }
      }
      function se(oe) {
        return W = oe, ie = 0, oe.length === 0 ? H : y(oe[ie]);
      }
      function y(oe) {
        return ut;
        function ut(De) {
          return m = _(), he = oe, oe.partial || (l.currentConstruct = oe), oe.name && l.parser.constructs.disable.null.includes(oe.name) ? $e() : oe.tokenize.call(
            // If we do have fields, create an object w/ `context` as its
            // prototype.
            // This allows a “live binding”, which is needed for `interrupt`.
            L ? Object.assign(Object.create(l), L) : l,
            u,
            de,
            $e
          )(De);
        }
      }
      function de(oe) {
        return N(he, m), O;
      }
      function $e(oe) {
        return m.restore(), ++ie < W.length ? y(W[ie]) : H;
      }
    }
  }
  function V(N, L) {
    N.resolveAll && !s.includes(N) && s.push(N), N.resolve && be(l.events, L, l.events.length - L, N.resolve(l.events.slice(L), l)), N.resolveTo && (l.events = N.resolveTo(l.events, l));
  }
  function _() {
    const N = p(), L = l.previous, F = l.currentConstruct, D = l.events.length, O = Array.from(a);
    return {
      from: D,
      restore: H
    };
    function H() {
      r = N, l.previous = L, l.currentConstruct = F, l.events.length = D, a = O, v();
    }
  }
  function v() {
    r.line in i && r.column < 2 && (r.column = i[r.line], r.offset += i[r.line] - 1);
  }
}
function bc(e, t) {
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
function xc(e, t) {
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
function kc(e) {
  const r = {
    constructs: (
      /** @type {FullNormalizedExtension} */
      ws([mc, ...(e || {}).extensions || []])
    ),
    content: i(Dl),
    defined: [],
    document: i(Ml),
    flow: i(tc),
    lazy: {},
    string: i(ic),
    text: i(sc)
  };
  return r;
  function i(s) {
    return o;
    function o(a) {
      return yc(r, s, a);
    }
  }
}
function wc(e) {
  for (; !Is(e); )
    ;
  return e;
}
const di = /[\0\t\n\r]/g;
function vc() {
  let e = 1, t = "", n = !0, r;
  return i;
  function i(s, o, a) {
    const u = [];
    let l, f, c, d, h;
    for (s = t + (typeof s == "string" ? s.toString() : new TextDecoder(o || void 0).decode(s)), c = 0, t = "", n && (s.charCodeAt(0) === 65279 && c++, n = void 0); c < s.length; ) {
      if (di.lastIndex = c, l = di.exec(s), d = l && l.index !== void 0 ? l.index : s.length, h = s.charCodeAt(d), !l) {
        t = s.slice(c);
        break;
      }
      if (h === 10 && c === d && r)
        u.push(-3), r = void 0;
      else
        switch (r && (u.push(-5), r = void 0), c < d && (u.push(s.slice(c, d)), e += d - c), h) {
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
      c = d + 1;
    }
    return a && (r && u.push(-5), t && u.push(t), u.push(null)), u;
  }
}
const Sc = /\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;
function Cc(e) {
  return e.replace(Sc, Ec);
}
function Ec(e, t, n) {
  if (t)
    return t;
  if (n.charCodeAt(0) === 35) {
    const i = n.charCodeAt(1), s = i === 120 || i === 88;
    return vs(n.slice(s ? 2 : 1), s ? 16 : 10);
  }
  return or(n) || e;
}
const Os = {}.hasOwnProperty;
function Ic(e, t, n) {
  return t && typeof t == "object" && (n = t, t = void 0), Tc(n)(wc(kc(n).document().write(vc()(e, t, !0))));
}
function Tc(e) {
  const t = {
    transforms: [],
    canContainEols: ["emphasis", "fragment", "heading", "paragraph", "strong"],
    enter: {
      autolink: s(wr),
      autolinkProtocol: _,
      autolinkEmail: _,
      atxHeading: s(br),
      blockQuote: s(Xe),
      characterEscape: _,
      characterReference: _,
      codeFenced: s(At),
      codeFencedFenceInfo: o,
      codeFencedFenceMeta: o,
      codeIndented: s(At, o),
      codeText: s(bo, o),
      codeTextData: _,
      data: _,
      codeFlowValue: _,
      definition: s(xo),
      definitionDestinationString: o,
      definitionLabelString: o,
      definitionTitleString: o,
      emphasis: s(ko),
      hardBreakEscape: s(xr),
      hardBreakTrailing: s(xr),
      htmlFlow: s(kr, o),
      htmlFlowData: _,
      htmlText: s(kr, o),
      htmlTextData: _,
      image: s(wo),
      label: o,
      link: s(wr),
      listItem: s(vo),
      listItemValue: d,
      listOrdered: s(vr, c),
      listUnordered: s(vr),
      paragraph: s(So),
      reference: y,
      referenceString: o,
      resourceDestinationString: o,
      resourceTitleString: o,
      setextHeading: s(br),
      strong: s(Co),
      thematicBreak: s(Io)
    },
    exit: {
      atxHeading: u(),
      atxHeadingSequence: R,
      autolink: u(),
      autolinkEmail: Qe,
      autolinkProtocol: De,
      blockQuote: u(),
      characterEscapeValue: v,
      characterReferenceMarkerHexadecimal: $e,
      characterReferenceMarkerNumeric: $e,
      characterReferenceValue: oe,
      characterReference: ut,
      codeFenced: u(k),
      codeFencedFence: g,
      codeFencedFenceInfo: h,
      codeFencedFenceMeta: p,
      codeFlowValue: v,
      codeIndented: u(b),
      codeText: u(O),
      codeTextData: v,
      data: v,
      definition: u(),
      definitionDestinationString: I,
      definitionLabelString: S,
      definitionTitleString: w,
      emphasis: u(),
      hardBreakEscape: u(L),
      hardBreakTrailing: u(L),
      htmlFlow: u(F),
      htmlFlowData: v,
      htmlText: u(D),
      htmlTextData: v,
      image: u(W),
      label: he,
      labelText: ie,
      lineEnding: N,
      link: u(H),
      listItem: u(),
      listOrdered: u(),
      listUnordered: u(),
      paragraph: u(),
      referenceString: de,
      resourceDestinationString: m,
      resourceTitleString: Z,
      resource: se,
      setextHeading: u(V),
      setextHeadingLineSequence: z,
      setextHeadingText: C,
      strong: u(),
      thematicBreak: u()
    }
  };
  Ps(t, (e || {}).mdastExtensions || []);
  const n = {};
  return r;
  function r(E) {
    let A = {
      type: "root",
      children: []
    };
    const B = {
      stack: [A],
      tokenStack: [],
      config: t,
      enter: a,
      exit: l,
      buffer: o,
      resume: f,
      data: n
    }, q = [];
    let J = -1;
    for (; ++J < E.length; )
      if (E[J][1].type === "listOrdered" || E[J][1].type === "listUnordered")
        if (E[J][0] === "enter")
          q.push(J);
        else {
          const ve = q.pop();
          J = i(E, ve, J);
        }
    for (J = -1; ++J < E.length; ) {
      const ve = t[E[J][0]];
      Os.call(ve, E[J][1].type) && ve[E[J][1].type].call(Object.assign({
        sliceSerialize: E[J][2].sliceSerialize
      }, B), E[J][1]);
    }
    if (B.tokenStack.length > 0) {
      const ve = B.tokenStack[B.tokenStack.length - 1];
      (ve[1] || pi).call(B, void 0, ve[0]);
    }
    for (A.position = {
      start: Fe(E.length > 0 ? E[0][1].start : {
        line: 1,
        column: 1,
        offset: 0
      }),
      end: Fe(E.length > 0 ? E[E.length - 2][1].end : {
        line: 1,
        column: 1,
        offset: 0
      })
    }, J = -1; ++J < t.transforms.length; )
      A = t.transforms[J](A) || A;
    return A;
  }
  function i(E, A, B) {
    let q = A - 1, J = -1, ve = !1, Be, Le, ct, ft;
    for (; ++q <= B; ) {
      const me = E[q];
      switch (me[1].type) {
        case "listUnordered":
        case "listOrdered":
        case "blockQuote": {
          me[0] === "enter" ? J++ : J--, ft = void 0;
          break;
        }
        case "lineEndingBlank": {
          me[0] === "enter" && (Be && !ft && !J && !ct && (ct = q), ft = void 0);
          break;
        }
        case "linePrefix":
        case "listItemValue":
        case "listItemMarker":
        case "listItemPrefix":
        case "listItemPrefixWhitespace":
          break;
        default:
          ft = void 0;
      }
      if (!J && me[0] === "enter" && me[1].type === "listItemPrefix" || J === -1 && me[0] === "exit" && (me[1].type === "listUnordered" || me[1].type === "listOrdered")) {
        if (Be) {
          let Ze = q;
          for (Le = void 0; Ze--; ) {
            const Ae = E[Ze];
            if (Ae[1].type === "lineEnding" || Ae[1].type === "lineEndingBlank") {
              if (Ae[0] === "exit") continue;
              Le && (E[Le][1].type = "lineEndingBlank", ve = !0), Ae[1].type = "lineEnding", Le = Ze;
            } else if (!(Ae[1].type === "linePrefix" || Ae[1].type === "blockQuotePrefix" || Ae[1].type === "blockQuotePrefixWhitespace" || Ae[1].type === "blockQuoteMarker" || Ae[1].type === "listItemIndent")) break;
          }
          ct && (!Le || ct < Le) && (Be._spread = !0), Be.end = Object.assign({}, Le ? E[Le][1].start : me[1].end), E.splice(Le || q, 0, ["exit", Be, me[2]]), q++, B++;
        }
        if (me[1].type === "listItemPrefix") {
          const Ze = {
            type: "listItem",
            _spread: !1,
            start: Object.assign({}, me[1].start),
            // @ts-expect-error: we’ll add `end` in a second.
            end: void 0
          };
          Be = Ze, E.splice(q, 0, ["enter", Ze, me[2]]), q++, B++, ct = void 0, ft = !0;
        }
      }
    }
    return E[A][1]._spread = ve, B;
  }
  function s(E, A) {
    return B;
    function B(q) {
      a.call(this, E(q), q), A && A.call(this, q);
    }
  }
  function o() {
    this.stack.push({
      type: "fragment",
      children: []
    });
  }
  function a(E, A, B) {
    this.stack[this.stack.length - 1].children.push(E), this.stack.push(E), this.tokenStack.push([A, B || void 0]), E.position = {
      start: Fe(A.start),
      // @ts-expect-error: `end` will be patched later.
      end: void 0
    };
  }
  function u(E) {
    return A;
    function A(B) {
      E && E.call(this, B), l.call(this, B);
    }
  }
  function l(E, A) {
    const B = this.stack.pop(), q = this.tokenStack.pop();
    if (q)
      q[0].type !== E.type && (A ? A.call(this, E, q[0]) : (q[1] || pi).call(this, E, q[0]));
    else throw new Error("Cannot close `" + E.type + "` (" + wt({
      start: E.start,
      end: E.end
    }) + "): it’s not open");
    B.position.end = Fe(E.end);
  }
  function f() {
    return sr(this.stack.pop());
  }
  function c() {
    this.data.expectingFirstListItemValue = !0;
  }
  function d(E) {
    if (this.data.expectingFirstListItemValue) {
      const A = this.stack[this.stack.length - 2];
      A.start = Number.parseInt(this.sliceSerialize(E), 10), this.data.expectingFirstListItemValue = void 0;
    }
  }
  function h() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.lang = E;
  }
  function p() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.meta = E;
  }
  function g() {
    this.data.flowCodeInside || (this.buffer(), this.data.flowCodeInside = !0);
  }
  function k() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.value = E.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g, ""), this.data.flowCodeInside = void 0;
  }
  function b() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.value = E.replace(/(\r?\n|\r)$/g, "");
  }
  function S(E) {
    const A = this.resume(), B = this.stack[this.stack.length - 1];
    B.label = A, B.identifier = Ee(this.sliceSerialize(E)).toLowerCase();
  }
  function w() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.title = E;
  }
  function I() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.url = E;
  }
  function R(E) {
    const A = this.stack[this.stack.length - 1];
    if (!A.depth) {
      const B = this.sliceSerialize(E).length;
      A.depth = B;
    }
  }
  function C() {
    this.data.setextHeadingSlurpLineEnding = !0;
  }
  function z(E) {
    const A = this.stack[this.stack.length - 1];
    A.depth = this.sliceSerialize(E).codePointAt(0) === 61 ? 1 : 2;
  }
  function V() {
    this.data.setextHeadingSlurpLineEnding = void 0;
  }
  function _(E) {
    const B = this.stack[this.stack.length - 1].children;
    let q = B[B.length - 1];
    (!q || q.type !== "text") && (q = Eo(), q.position = {
      start: Fe(E.start),
      // @ts-expect-error: we’ll add `end` later.
      end: void 0
    }, B.push(q)), this.stack.push(q);
  }
  function v(E) {
    const A = this.stack.pop();
    A.value += this.sliceSerialize(E), A.position.end = Fe(E.end);
  }
  function N(E) {
    const A = this.stack[this.stack.length - 1];
    if (this.data.atHardBreak) {
      const B = A.children[A.children.length - 1];
      B.position.end = Fe(E.end), this.data.atHardBreak = void 0;
      return;
    }
    !this.data.setextHeadingSlurpLineEnding && t.canContainEols.includes(A.type) && (_.call(this, E), v.call(this, E));
  }
  function L() {
    this.data.atHardBreak = !0;
  }
  function F() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.value = E;
  }
  function D() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.value = E;
  }
  function O() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.value = E;
  }
  function H() {
    const E = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const A = this.data.referenceType || "shortcut";
      E.type += "Reference", E.referenceType = A, delete E.url, delete E.title;
    } else
      delete E.identifier, delete E.label;
    this.data.referenceType = void 0;
  }
  function W() {
    const E = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const A = this.data.referenceType || "shortcut";
      E.type += "Reference", E.referenceType = A, delete E.url, delete E.title;
    } else
      delete E.identifier, delete E.label;
    this.data.referenceType = void 0;
  }
  function ie(E) {
    const A = this.sliceSerialize(E), B = this.stack[this.stack.length - 2];
    B.label = Cc(A), B.identifier = Ee(A).toLowerCase();
  }
  function he() {
    const E = this.stack[this.stack.length - 1], A = this.resume(), B = this.stack[this.stack.length - 1];
    if (this.data.inReference = !0, B.type === "link") {
      const q = E.children;
      B.children = q;
    } else
      B.alt = A;
  }
  function m() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.url = E;
  }
  function Z() {
    const E = this.resume(), A = this.stack[this.stack.length - 1];
    A.title = E;
  }
  function se() {
    this.data.inReference = void 0;
  }
  function y() {
    this.data.referenceType = "collapsed";
  }
  function de(E) {
    const A = this.resume(), B = this.stack[this.stack.length - 1];
    B.label = A, B.identifier = Ee(this.sliceSerialize(E)).toLowerCase(), this.data.referenceType = "full";
  }
  function $e(E) {
    this.data.characterReferenceType = E.type;
  }
  function oe(E) {
    const A = this.sliceSerialize(E), B = this.data.characterReferenceType;
    let q;
    B ? (q = vs(A, B === "characterReferenceMarkerNumeric" ? 10 : 16), this.data.characterReferenceType = void 0) : q = or(A);
    const J = this.stack[this.stack.length - 1];
    J.value += q;
  }
  function ut(E) {
    const A = this.stack.pop();
    A.position.end = Fe(E.end);
  }
  function De(E) {
    v.call(this, E);
    const A = this.stack[this.stack.length - 1];
    A.url = this.sliceSerialize(E);
  }
  function Qe(E) {
    v.call(this, E);
    const A = this.stack[this.stack.length - 1];
    A.url = "mailto:" + this.sliceSerialize(E);
  }
  function Xe() {
    return {
      type: "blockquote",
      children: []
    };
  }
  function At() {
    return {
      type: "code",
      lang: null,
      meta: null,
      value: ""
    };
  }
  function bo() {
    return {
      type: "inlineCode",
      value: ""
    };
  }
  function xo() {
    return {
      type: "definition",
      identifier: "",
      label: null,
      title: null,
      url: ""
    };
  }
  function ko() {
    return {
      type: "emphasis",
      children: []
    };
  }
  function br() {
    return {
      type: "heading",
      // @ts-expect-error `depth` will be set later.
      depth: 0,
      children: []
    };
  }
  function xr() {
    return {
      type: "break"
    };
  }
  function kr() {
    return {
      type: "html",
      value: ""
    };
  }
  function wo() {
    return {
      type: "image",
      title: null,
      url: "",
      alt: null
    };
  }
  function wr() {
    return {
      type: "link",
      title: null,
      url: "",
      children: []
    };
  }
  function vr(E) {
    return {
      type: "list",
      ordered: E.type === "listOrdered",
      start: null,
      spread: E._spread,
      children: []
    };
  }
  function vo(E) {
    return {
      type: "listItem",
      spread: E._spread,
      checked: null,
      children: []
    };
  }
  function So() {
    return {
      type: "paragraph",
      children: []
    };
  }
  function Co() {
    return {
      type: "strong",
      children: []
    };
  }
  function Eo() {
    return {
      type: "text",
      value: ""
    };
  }
  function Io() {
    return {
      type: "thematicBreak"
    };
  }
}
function Fe(e) {
  return {
    line: e.line,
    column: e.column,
    offset: e.offset
  };
}
function Ps(e, t) {
  let n = -1;
  for (; ++n < t.length; ) {
    const r = t[n];
    Array.isArray(r) ? Ps(e, r) : Nc(e, r);
  }
}
function Nc(e, t) {
  let n;
  for (n in t)
    if (Os.call(t, n))
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
function pi(e, t) {
  throw e ? new Error("Cannot close `" + e.type + "` (" + wt({
    start: e.start,
    end: e.end
  }) + "): a different token (`" + t.type + "`, " + wt({
    start: t.start,
    end: t.end
  }) + ") is open") : new Error("Cannot close document, a token (`" + t.type + "`, " + wt({
    start: t.start,
    end: t.end
  }) + ") is still open");
}
function Lc(e) {
  const t = this;
  t.parser = n;
  function n(r) {
    return Ic(r, {
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
function Ac(e, t) {
  const n = {
    type: "element",
    tagName: "blockquote",
    properties: {},
    children: e.wrap(e.all(t), !0)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Rc(e, t) {
  const n = { type: "element", tagName: "br", properties: {}, children: [] };
  return e.patch(t, n), [e.applyData(t, n), { type: "text", value: `
` }];
}
function Oc(e, t) {
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
function Pc(e, t) {
  const n = {
    type: "element",
    tagName: "del",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function _c(e, t) {
  const n = {
    type: "element",
    tagName: "em",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Dc(e, t) {
  const n = typeof e.options.clobberPrefix == "string" ? e.options.clobberPrefix : "user-content-", r = String(t.identifier).toUpperCase(), i = lt(r.toLowerCase()), s = e.footnoteOrder.indexOf(r);
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
function Fc(e, t) {
  const n = {
    type: "element",
    tagName: "h" + t.depth,
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Mc(e, t) {
  if (e.options.allowDangerousHtml) {
    const n = { type: "raw", value: t.value };
    return e.patch(t, n), e.applyData(t, n);
  }
}
function _s(e, t) {
  const n = t.referenceType;
  let r = "]";
  if (n === "collapsed" ? r += "[]" : n === "full" && (r += "[" + (t.label || t.identifier) + "]"), t.type === "imageReference")
    return [{ type: "text", value: "![" + t.alt + r }];
  const i = e.all(t), s = i[0];
  s && s.type === "text" ? s.value = "[" + s.value : i.unshift({ type: "text", value: "[" });
  const o = i[i.length - 1];
  return o && o.type === "text" ? o.value += r : i.push({ type: "text", value: r }), i;
}
function zc(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return _s(e, t);
  const i = { src: lt(r.url || ""), alt: t.alt };
  r.title !== null && r.title !== void 0 && (i.title = r.title);
  const s = { type: "element", tagName: "img", properties: i, children: [] };
  return e.patch(t, s), e.applyData(t, s);
}
function jc(e, t) {
  const n = { src: lt(t.url) };
  t.alt !== null && t.alt !== void 0 && (n.alt = t.alt), t.title !== null && t.title !== void 0 && (n.title = t.title);
  const r = { type: "element", tagName: "img", properties: n, children: [] };
  return e.patch(t, r), e.applyData(t, r);
}
function $c(e, t) {
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
function Bc(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return _s(e, t);
  const i = { href: lt(r.url || "") };
  r.title !== null && r.title !== void 0 && (i.title = r.title);
  const s = {
    type: "element",
    tagName: "a",
    properties: i,
    children: e.all(t)
  };
  return e.patch(t, s), e.applyData(t, s);
}
function Vc(e, t) {
  const n = { href: lt(t.url) };
  t.title !== null && t.title !== void 0 && (n.title = t.title);
  const r = {
    type: "element",
    tagName: "a",
    properties: n,
    children: e.all(t)
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Hc(e, t, n) {
  const r = e.all(t), i = n ? Uc(n) : Ds(t), s = {}, o = [];
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
function Uc(e) {
  let t = !1;
  if (e.type === "list") {
    t = e.spread || !1;
    const n = e.children;
    let r = -1;
    for (; !t && ++r < n.length; )
      t = Ds(n[r]);
  }
  return t;
}
function Ds(e) {
  const t = e.spread;
  return t ?? e.children.length > 1;
}
function qc(e, t) {
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
function Kc(e, t) {
  const n = {
    type: "element",
    tagName: "p",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Wc(e, t) {
  const n = { type: "root", children: e.wrap(e.all(t)) };
  return e.patch(t, n), e.applyData(t, n);
}
function Gc(e, t) {
  const n = {
    type: "element",
    tagName: "strong",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Jc(e, t) {
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
    }, a = tr(t.children[1]), u = ps(t.children[t.children.length - 1]);
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
function Yc(e, t, n) {
  const r = n ? n.children : void 0, s = (r ? r.indexOf(t) : 1) === 0 ? "th" : "td", o = n && n.type === "table" ? n.align : void 0, a = o ? o.length : t.children.length;
  let u = -1;
  const l = [];
  for (; ++u < a; ) {
    const c = t.children[u], d = {}, h = o ? o[u] : void 0;
    h && (d.align = h);
    let p = { type: "element", tagName: s, properties: d, children: [] };
    c && (p.children = e.all(c), e.patch(c, p), p = e.applyData(c, p)), l.push(p);
  }
  const f = {
    type: "element",
    tagName: "tr",
    properties: {},
    children: e.wrap(l, !0)
  };
  return e.patch(t, f), e.applyData(t, f);
}
function Qc(e, t) {
  const n = {
    type: "element",
    tagName: "td",
    // Assume body cell.
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
const gi = 9, mi = 32;
function Xc(e) {
  const t = String(e), n = /\r?\n|\r/g;
  let r = n.exec(t), i = 0;
  const s = [];
  for (; r; )
    s.push(
      yi(t.slice(i, r.index), i > 0, !0),
      r[0]
    ), i = r.index + r[0].length, r = n.exec(t);
  return s.push(yi(t.slice(i), i > 0, !1)), s.join("");
}
function yi(e, t, n) {
  let r = 0, i = e.length;
  if (t) {
    let s = e.codePointAt(r);
    for (; s === gi || s === mi; )
      r++, s = e.codePointAt(r);
  }
  if (n) {
    let s = e.codePointAt(i - 1);
    for (; s === gi || s === mi; )
      i--, s = e.codePointAt(i - 1);
  }
  return i > r ? e.slice(r, i) : "";
}
function Zc(e, t) {
  const n = { type: "text", value: Xc(String(t.value)) };
  return e.patch(t, n), e.applyData(t, n);
}
function ef(e, t) {
  const n = {
    type: "element",
    tagName: "hr",
    properties: {},
    children: []
  };
  return e.patch(t, n), e.applyData(t, n);
}
const tf = {
  blockquote: Ac,
  break: Rc,
  code: Oc,
  delete: Pc,
  emphasis: _c,
  footnoteReference: Dc,
  heading: Fc,
  html: Mc,
  imageReference: zc,
  image: jc,
  inlineCode: $c,
  linkReference: Bc,
  link: Vc,
  listItem: Hc,
  list: qc,
  paragraph: Kc,
  // @ts-expect-error: root is different, but hard to type.
  root: Wc,
  strong: Gc,
  table: Jc,
  tableCell: Qc,
  tableRow: Yc,
  text: Zc,
  thematicBreak: ef,
  toml: Pt,
  yaml: Pt,
  definition: Pt,
  footnoteDefinition: Pt
};
function Pt() {
}
const Fs = -1, Qt = 0, St = 1, Ut = 2, lr = 3, ur = 4, cr = 5, fr = 6, Ms = 7, zs = 8, js = typeof self == "object" ? self : globalThis, bi = (e, t) => {
  switch (e) {
    case "Function":
    case "SharedWorker":
    case "Worker":
    case "eval":
    case "setInterval":
    case "setTimeout":
      throw new TypeError("unable to deserialize " + e);
  }
  return new js[e](t);
}, nf = (e, t) => {
  const n = (i, s) => (e.set(s, i), i), r = (i) => {
    if (e.has(i))
      return e.get(i);
    const [s, o] = t[i];
    switch (s) {
      case Qt:
      case Fs:
        return n(o, i);
      case St: {
        const a = n([], i);
        for (const u of o)
          a.push(r(u));
        return a;
      }
      case Ut: {
        const a = n({}, i);
        for (const [u, l] of o)
          a[r(u)] = r(l);
        return a;
      }
      case lr:
        return n(new Date(o), i);
      case ur: {
        const { source: a, flags: u } = o;
        return n(new RegExp(a, u), i);
      }
      case cr: {
        const a = n(/* @__PURE__ */ new Map(), i);
        for (const [u, l] of o)
          a.set(r(u), r(l));
        return a;
      }
      case fr: {
        const a = n(/* @__PURE__ */ new Set(), i);
        for (const u of o)
          a.add(r(u));
        return a;
      }
      case Ms: {
        const { name: a, message: u } = o;
        return n(
          typeof js[a] == "function" ? bi(a, u) : new Error(u),
          i
        );
      }
      case zs:
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
    return n(bi(s, o), i);
  };
  return r;
}, xi = (e) => nf(/* @__PURE__ */ new Map(), e)(0), He = "", { toString: rf } = {}, { keys: sf } = Object, yt = (e) => {
  const t = typeof e;
  if (t !== "object" || !e)
    return [Qt, t];
  const n = rf.call(e).slice(8, -1);
  switch (n) {
    case "Array":
      return [St, He];
    case "Object":
      return [Ut, He];
    case "Date":
      return [lr, He];
    case "RegExp":
      return [ur, He];
    case "Map":
      return [cr, He];
    case "Set":
      return [fr, He];
    case "DataView":
      return [St, n];
  }
  return n.includes("Array") ? [St, n] : e instanceof Error ? [Ms, e.name || "Error"] : [Ut, n];
}, _t = ([e, t]) => e === Qt && (t === "function" || t === "symbol"), of = (e, t, n, r) => {
  const i = (o, a) => {
    const u = r.push(o) - 1;
    return n.set(a, u), u;
  }, s = (o) => {
    if (n.has(o))
      return n.get(o);
    let [a, u] = yt(o);
    switch (a) {
      case Qt: {
        let f = o;
        switch (u) {
          case "bigint":
            a = zs, f = o.toString();
            break;
          case "function":
          case "symbol":
            if (e)
              throw new TypeError("unable to serialize " + u);
            f = null;
            break;
          case "undefined":
            return i([Fs], o);
        }
        return i([a, f], o);
      }
      case St: {
        if (u) {
          let d = o;
          return u === "DataView" ? d = new Uint8Array(o.buffer) : u === "ArrayBuffer" && (d = new Uint8Array(o)), i([u, [...d]], o);
        }
        const f = [], c = i([a, f], o);
        for (const d of o)
          f.push(s(d));
        return c;
      }
      case Ut: {
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
        for (const d of sf(o))
          (e || !_t(yt(o[d]))) && f.push([s(d), s(o[d])]);
        return c;
      }
      case lr:
        return i([a, isNaN(o.getTime()) ? He : o.toISOString()], o);
      case ur: {
        const { source: f, flags: c } = o;
        return i([a, { source: f, flags: c }], o);
      }
      case cr: {
        const f = [], c = i([a, f], o);
        for (const [d, h] of o)
          (e || !(_t(yt(d)) || _t(yt(h)))) && f.push([s(d), s(h)]);
        return c;
      }
      case fr: {
        const f = [], c = i([a, f], o);
        for (const d of o)
          (e || !_t(yt(d))) && f.push(s(d));
        return c;
      }
    }
    const { message: l } = o;
    return i([a, { name: u, message: l }], o);
  };
  return s;
}, ki = (e, { json: t, lossy: n } = {}) => {
  const r = [];
  return of(!(t || n), !!t, /* @__PURE__ */ new Map(), r)(e), r;
}, qt = typeof structuredClone == "function" ? (
  /* c8 ignore start */
  (e, t) => t && ("json" in t || "lossy" in t) ? xi(ki(e, t)) : structuredClone(e)
) : (e, t) => xi(ki(e, t));
function af(e, t) {
  const n = [{ type: "text", value: "↩" }];
  return t > 1 && n.push({
    type: "element",
    tagName: "sup",
    properties: {},
    children: [{ type: "text", value: String(t) }]
  }), n;
}
function lf(e, t) {
  return "Back to reference " + (e + 1) + (t > 1 ? "-" + t : "");
}
function uf(e) {
  const t = typeof e.options.clobberPrefix == "string" ? e.options.clobberPrefix : "user-content-", n = e.options.footnoteBackContent || af, r = e.options.footnoteBackLabel || lf, i = e.options.footnoteLabel || "Footnotes", s = e.options.footnoteLabelTagName || "h2", o = e.options.footnoteLabelProperties || {
    className: ["sr-only"]
  }, a = [];
  let u = -1;
  for (; ++u < e.footnoteOrder.length; ) {
    const l = e.footnoteById.get(
      e.footnoteOrder[u]
    );
    if (!l)
      continue;
    const f = e.all(l), c = String(l.identifier).toUpperCase(), d = lt(c.toLowerCase());
    let h = 0;
    const p = [], g = e.footnoteCounts.get(c);
    for (; g !== void 0 && ++h <= g; ) {
      p.length > 0 && p.push({ type: "text", value: " " });
      let S = typeof n == "string" ? n : n(u, h);
      typeof S == "string" && (S = { type: "text", value: S }), p.push({
        type: "element",
        tagName: "a",
        properties: {
          href: "#" + t + "fnref-" + d + (h > 1 ? "-" + h : ""),
          dataFootnoteBackref: "",
          ariaLabel: typeof r == "string" ? r : r(u, h),
          className: ["data-footnote-backref"]
        },
        children: Array.isArray(S) ? S : [S]
      });
    }
    const k = f[f.length - 1];
    if (k && k.type === "element" && k.tagName === "p") {
      const S = k.children[k.children.length - 1];
      S && S.type === "text" ? S.value += " " : k.children.push({ type: "text", value: " " }), k.children.push(...p);
    } else
      f.push(...p);
    const b = {
      type: "element",
      tagName: "li",
      properties: { id: t + "fn-" + d },
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
const Xt = (
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
      return df;
    if (typeof e == "function")
      return Zt(e);
    if (typeof e == "object")
      return Array.isArray(e) ? cf(e) : (
        // Cast because `ReadonlyArray` goes into the above but `isArray`
        // narrows to `Array`.
        ff(
          /** @type {Props} */
          e
        )
      );
    if (typeof e == "string")
      return hf(e);
    throw new Error("Expected function, string, or object as test");
  })
);
function cf(e) {
  const t = [];
  let n = -1;
  for (; ++n < e.length; )
    t[n] = Xt(e[n]);
  return Zt(r);
  function r(...i) {
    let s = -1;
    for (; ++s < t.length; )
      if (t[s].apply(this, i)) return !0;
    return !1;
  }
}
function ff(e) {
  const t = (
    /** @type {Record<string, unknown>} */
    e
  );
  return Zt(n);
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
function hf(e) {
  return Zt(t);
  function t(n) {
    return n && n.type === e;
  }
}
function Zt(e) {
  return t;
  function t(n, r, i) {
    return !!(pf(n) && e.call(
      this,
      n,
      typeof r == "number" ? r : void 0,
      i || void 0
    ));
  }
}
function df() {
  return !0;
}
function pf(e) {
  return e !== null && typeof e == "object" && "type" in e;
}
const $s = [], gf = !0, Bn = !1, mf = "skip";
function Bs(e, t, n, r) {
  let i;
  typeof t == "function" && typeof n != "function" ? (r = n, n = t) : i = t;
  const s = Xt(i), o = r ? -1 : 1;
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
      Object.defineProperty(d, "name", {
        value: "node (" + (u.type + (h ? "<" + h + ">" : "")) + ")"
      });
    }
    return d;
    function d() {
      let h = $s, p, g, k;
      if ((!t || s(u, l, f[f.length - 1] || void 0)) && (h = yf(n(u, f)), h[0] === Bn))
        return h;
      if ("children" in u && u.children) {
        const b = (
          /** @type {UnistParent} */
          u
        );
        if (b.children && h[0] !== mf)
          for (g = (r ? b.children.length : -1) + o, k = f.concat(b); g > -1 && g < b.children.length; ) {
            const S = b.children[g];
            if (p = a(S, g, k)(), p[0] === Bn)
              return p;
            g = typeof p[1] == "number" ? p[1] : g + o;
          }
      }
      return h;
    }
  }
}
function yf(e) {
  return Array.isArray(e) ? e : typeof e == "number" ? [gf, e] : e == null ? $s : [e];
}
function hr(e, t, n, r) {
  let i, s, o;
  typeof t == "function" && typeof n != "function" ? (s = void 0, o = t, i = n) : (s = t, o = n, i = r), Bs(e, s, a, i);
  function a(u, l) {
    const f = l[l.length - 1], c = f ? f.children.indexOf(u) : void 0;
    return o(u, c, f);
  }
}
const Vn = {}.hasOwnProperty, bf = {};
function xf(e, t) {
  const n = t || bf, r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), o = { ...tf, ...n.handlers }, a = {
    all: l,
    applyData: wf,
    definitionById: r,
    footnoteById: i,
    footnoteCounts: s,
    footnoteOrder: [],
    handlers: o,
    one: u,
    options: n,
    patch: kf,
    wrap: Sf
  };
  return hr(e, function(f) {
    if (f.type === "definition" || f.type === "footnoteDefinition") {
      const c = f.type === "definition" ? r : i, d = String(f.identifier).toUpperCase();
      c.has(d) || c.set(d, f);
    }
  }), a;
  function u(f, c) {
    const d = f.type, h = a.handlers[d];
    if (Vn.call(a.handlers, d) && h)
      return h(a, f, c);
    if (a.options.passThrough && a.options.passThrough.includes(d)) {
      if ("children" in f) {
        const { children: g, ...k } = f, b = qt(k);
        return b.children = a.all(f), b;
      }
      return qt(f);
    }
    return (a.options.unknownHandler || vf)(a, f, c);
  }
  function l(f) {
    const c = [];
    if ("children" in f) {
      const d = f.children;
      let h = -1;
      for (; ++h < d.length; ) {
        const p = a.one(d[h], f);
        if (p) {
          if (h && d[h - 1].type === "break" && (!Array.isArray(p) && p.type === "text" && (p.value = wi(p.value)), !Array.isArray(p) && p.type === "element")) {
            const g = p.children[0];
            g && g.type === "text" && (g.value = wi(g.value));
          }
          Array.isArray(p) ? c.push(...p) : c.push(p);
        }
      }
    }
    return c;
  }
}
function kf(e, t) {
  e.position && (t.position = al(e));
}
function wf(e, t) {
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
function vf(e, t) {
  const n = t.data || {}, r = "value" in t && !(Vn.call(n, "hProperties") || Vn.call(n, "hChildren")) ? { type: "text", value: t.value } : {
    type: "element",
    tagName: "div",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Sf(e, t) {
  const n = [];
  let r = -1;
  for (t && n.push({ type: "text", value: `
` }); ++r < e.length; )
    r && n.push({ type: "text", value: `
` }), n.push(e[r]);
  return t && e.length > 0 && n.push({ type: "text", value: `
` }), n;
}
function wi(e) {
  let t = 0, n = e.charCodeAt(t);
  for (; n === 9 || n === 32; )
    t++, n = e.charCodeAt(t);
  return e.slice(t);
}
function vi(e, t) {
  const n = xf(e, t), r = n.one(e, void 0), i = uf(n), s = Array.isArray(r) ? { type: "root", children: r } : r || { type: "root", children: [] };
  return i && s.children.push({ type: "text", value: `
` }, i), s;
}
function Cf(e, t) {
  return e && "run" in e ? async function(n, r) {
    const i = (
      /** @type {HastRoot} */
      vi(n, { file: r, ...t })
    );
    await e.run(i, r);
  } : function(n, r) {
    return (
      /** @type {HastRoot} */
      vi(n, { file: r, ...e || t })
    );
  };
}
function Si(e) {
  if (e)
    throw e;
}
var gn, Ci;
function Ef() {
  if (Ci) return gn;
  Ci = 1;
  var e = Object.prototype.hasOwnProperty, t = Object.prototype.toString, n = Object.defineProperty, r = Object.getOwnPropertyDescriptor, i = function(l) {
    return typeof Array.isArray == "function" ? Array.isArray(l) : t.call(l) === "[object Array]";
  }, s = function(l) {
    if (!l || t.call(l) !== "[object Object]")
      return !1;
    var f = e.call(l, "constructor"), c = l.constructor && l.constructor.prototype && e.call(l.constructor.prototype, "isPrototypeOf");
    if (l.constructor && !f && !c)
      return !1;
    var d;
    for (d in l)
      ;
    return typeof d > "u" || e.call(l, d);
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
  return gn = function u() {
    var l, f, c, d, h, p, g = arguments[0], k = 1, b = arguments.length, S = !1;
    for (typeof g == "boolean" && (S = g, g = arguments[1] || {}, k = 2), (g == null || typeof g != "object" && typeof g != "function") && (g = {}); k < b; ++k)
      if (l = arguments[k], l != null)
        for (f in l)
          c = a(g, f), d = a(l, f), g !== d && (S && d && (s(d) || (h = i(d))) ? (h ? (h = !1, p = c && i(c) ? c : []) : p = c && s(c) ? c : {}, o(g, { name: f, newValue: u(S, p, d) })) : typeof d < "u" && o(g, { name: f, newValue: d }));
    return g;
  }, gn;
}
var If = Ef();
const mn = /* @__PURE__ */ Wi(If);
function Hn(e) {
  if (typeof e != "object" || e === null)
    return !1;
  const t = Object.getPrototypeOf(e);
  return (t === null || t === Object.prototype || Object.getPrototypeOf(t) === null) && !(Symbol.toStringTag in e) && !(Symbol.iterator in e);
}
function Tf() {
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
      i = l, f ? Nf(f, a)(...l) : o(null, ...l);
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
function Nf(e, t) {
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
const Ie = { basename: Lf, dirname: Af, extname: Rf, join: Of, sep: "/" };
function Lf(e, t) {
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
function Af(e) {
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
function Rf(e) {
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
function Of(...e) {
  let t = -1, n;
  for (; ++t < e.length; )
    Lt(e[t]), e[t] && (n = n === void 0 ? e[t] : n + "/" + e[t]);
  return n === void 0 ? "." : Pf(n);
}
function Pf(e) {
  Lt(e);
  const t = e.codePointAt(0) === 47;
  let n = _f(e, !t);
  return n.length === 0 && !t && (n = "."), n.length > 0 && e.codePointAt(e.length - 1) === 47 && (n += "/"), t ? "/" + n : n;
}
function _f(e, t) {
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
const Df = { cwd: Ff };
function Ff() {
  return "/";
}
function Un(e) {
  return !!(e !== null && typeof e == "object" && "href" in e && e.href && "protocol" in e && e.protocol && // @ts-expect-error: indexing is fine.
  e.auth === void 0);
}
function Mf(e) {
  if (typeof e == "string")
    e = new URL(e);
  else if (!Un(e)) {
    const t = new TypeError(
      'The "path" argument must be of type string or an instance of URL. Received `' + e + "`"
    );
    throw t.code = "ERR_INVALID_ARG_TYPE", t;
  }
  if (e.protocol !== "file:") {
    const t = new TypeError("The URL must be of scheme file");
    throw t.code = "ERR_INVALID_URL_SCHEME", t;
  }
  return zf(e);
}
function zf(e) {
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
const yn = (
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
class Vs {
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
    t ? Un(t) ? n = { path: t } : typeof t == "string" || jf(t) ? n = { value: t } : n = t : n = {}, this.cwd = "cwd" in n ? "" : Df.cwd(), this.data = {}, this.history = [], this.messages = [], this.value, this.map, this.result, this.stored;
    let r = -1;
    for (; ++r < yn.length; ) {
      const s = yn[r];
      s in n && n[s] !== void 0 && n[s] !== null && (this[s] = s === "history" ? [...n[s]] : n[s]);
    }
    let i;
    for (i in n)
      yn.includes(i) || (this[i] = n[i]);
  }
  /**
   * Get the basename (including extname) (example: `'index.min.js'`).
   *
   * @returns {string | undefined}
   *   Basename.
   */
  get basename() {
    return typeof this.path == "string" ? Ie.basename(this.path) : void 0;
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
    xn(t, "basename"), bn(t, "basename"), this.path = Ie.join(this.dirname || "", t);
  }
  /**
   * Get the parent path (example: `'~'`).
   *
   * @returns {string | undefined}
   *   Dirname.
   */
  get dirname() {
    return typeof this.path == "string" ? Ie.dirname(this.path) : void 0;
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
    Ei(this.basename, "dirname"), this.path = Ie.join(t || "", this.basename);
  }
  /**
   * Get the extname (including dot) (example: `'.js'`).
   *
   * @returns {string | undefined}
   *   Extname.
   */
  get extname() {
    return typeof this.path == "string" ? Ie.extname(this.path) : void 0;
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
    if (bn(t, "extname"), Ei(this.dirname, "extname"), t) {
      if (t.codePointAt(0) !== 46)
        throw new Error("`extname` must start with `.`");
      if (t.includes(".", 1))
        throw new Error("`extname` cannot contain multiple dots");
    }
    this.path = Ie.join(this.dirname, this.stem + (t || ""));
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
    Un(t) && (t = Mf(t)), xn(t, "path"), this.path !== t && this.history.push(t);
  }
  /**
   * Get the stem (basename w/o extname) (example: `'index.min'`).
   *
   * @returns {string | undefined}
   *   Stem.
   */
  get stem() {
    return typeof this.path == "string" ? Ie.basename(this.path, this.extname) : void 0;
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
    xn(t, "stem"), bn(t, "stem"), this.path = Ie.join(this.dirname || "", t + (this.extname || ""));
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
    const i = new ue(
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
function bn(e, t) {
  if (e && e.includes(Ie.sep))
    throw new Error(
      "`" + t + "` cannot be a path: did not expect `" + Ie.sep + "`"
    );
}
function xn(e, t) {
  if (!e)
    throw new Error("`" + t + "` cannot be empty");
}
function Ei(e, t) {
  if (!e)
    throw new Error("Setting `" + t + "` requires `path` to be set too");
}
function jf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const $f = (
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
), Bf = {}.hasOwnProperty;
class dr extends $f {
  /**
   * Create a processor.
   */
  constructor() {
    super("copy"), this.Compiler = void 0, this.Parser = void 0, this.attachers = [], this.compiler = void 0, this.freezeIndex = -1, this.frozen = void 0, this.namespace = {}, this.parser = void 0, this.transformers = Tf();
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
      new dr()
    );
    let n = -1;
    for (; ++n < this.attachers.length; ) {
      const r = this.attachers[n];
      t.use(...r);
    }
    return t.data(mn(!0, {}, this.namespace)), t;
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
    return typeof t == "string" ? arguments.length === 2 ? (vn("data", this.frozen), this.namespace[t] = n, this) : Bf.call(this.namespace, t) && this.namespace[t] || void 0 : t ? (vn("data", this.frozen), this.namespace = t, this) : this.namespace;
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
    return kn("parse", r), r(String(n), n);
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
    return this.freeze(), kn("process", this.parser || this.Parser), wn("process", this.compiler || this.Compiler), n ? i(void 0, n) : new Promise(i);
    function i(s, o) {
      const a = Dt(t), u = (
        /** @type {HeadTree extends undefined ? Node : HeadTree} */
        /** @type {unknown} */
        r.parse(a)
      );
      r.run(u, a, function(f, c, d) {
        if (f || !c || !d)
          return l(f);
        const h = (
          /** @type {CompileTree extends undefined ? Node : CompileTree} */
          /** @type {unknown} */
          c
        ), p = r.stringify(h, d);
        Uf(p) ? d.value = p : d.result = p, l(
          f,
          /** @type {VFileWithOutput<CompileResult>} */
          d
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
    return this.freeze(), kn("processSync", this.parser || this.Parser), wn("processSync", this.compiler || this.Compiler), this.process(t, i), Ti("processSync", "process", n), r;
    function i(s, o) {
      n = !0, Si(s), r = o;
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
    Ii(t), this.freeze();
    const i = this.transformers;
    return !r && typeof n == "function" && (r = n, n = void 0), r ? s(void 0, r) : new Promise(s);
    function s(o, a) {
      const u = Dt(n);
      i.run(t, u, l);
      function l(f, c, d) {
        const h = (
          /** @type {TailTree extends undefined ? Node : TailTree} */
          c || t
        );
        f ? a(f) : o ? o(h) : r(void 0, h, d);
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
    return this.run(t, n, s), Ti("runSync", "run", r), i;
    function s(o, a) {
      Si(o), i = a, r = !0;
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
    return wn("stringify", i), Ii(t), i(t, r);
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
    if (vn("use", this.frozen), t != null) if (typeof t == "function")
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
      a(l.plugins), l.settings && (i.settings = mn(!0, i.settings, l.settings));
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
      let c = -1, d = -1;
      for (; ++c < r.length; )
        if (r[c][0] === l) {
          d = c;
          break;
        }
      if (d === -1)
        r.push([l, ...f]);
      else if (f.length > 0) {
        let [h, ...p] = f;
        const g = r[d][1];
        Hn(g) && Hn(h) && (h = mn(!0, g, h)), r[d] = [l, h, ...p];
      }
    }
  }
}
const Vf = new dr().freeze();
function kn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `parser`");
}
function wn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `compiler`");
}
function vn(e, t) {
  if (t)
    throw new Error(
      "Cannot call `" + e + "` on a frozen processor.\nCreate a new processor first, by calling it: use `processor()` instead of `processor`."
    );
}
function Ii(e) {
  if (!Hn(e) || typeof e.type != "string")
    throw new TypeError("Expected node, got `" + e + "`");
}
function Ti(e, t, n) {
  if (!n)
    throw new Error(
      "`" + e + "` finished async. Use `" + t + "` instead"
    );
}
function Dt(e) {
  return Hf(e) ? e : new Vs(e);
}
function Hf(e) {
  return !!(e && typeof e == "object" && "message" in e && "messages" in e);
}
function Uf(e) {
  return typeof e == "string" || qf(e);
}
function qf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const Kf = "https://github.com/remarkjs/react-markdown/blob/main/changelog.md", Ni = [], Li = { allowDangerousHtml: !0 }, Wf = /^(https?|ircs?|mailto|xmpp)$/i, Gf = [
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
function Jf(e) {
  const t = Yf(e), n = Qf(e);
  return Xf(t.runSync(t.parse(n), n), e);
}
function Yf(e) {
  const t = e.rehypePlugins || Ni, n = e.remarkPlugins || Ni, r = e.remarkRehypeOptions ? { ...e.remarkRehypeOptions, ...Li } : Li;
  return Vf().use(Lc).use(n).use(Cf, r).use(t);
}
function Qf(e) {
  const t = e.children || "", n = new Vs();
  return typeof t == "string" && (n.value = t), n;
}
function Xf(e, t) {
  const n = t.allowedElements, r = t.allowElement, i = t.components, s = t.disallowedElements, o = t.skipHtml, a = t.unwrapDisallowed, u = t.urlTransform || Zf;
  for (const f of Gf)
    Object.hasOwn(t, f.from) && ("" + f.from + (f.to ? "use `" + f.to + "` instead" : "remove it") + Kf + f.id, void 0);
  return hr(e, l), hl(e, {
    Fragment: Vi,
    components: i,
    ignoreInvalidStyle: !0,
    jsx: x,
    jsxs: P,
    passKeys: !0,
    passNode: !0
  });
  function l(f, c, d) {
    if (f.type === "raw" && d && typeof c == "number")
      return o ? d.children.splice(c, 1) : d.children[c] = { type: "text", value: f.value }, c;
    if (f.type === "element") {
      let h;
      for (h in hn)
        if (Object.hasOwn(hn, h) && Object.hasOwn(f.properties, h)) {
          const p = f.properties[h], g = hn[h];
          (g === null || g.includes(f.tagName)) && (f.properties[h] = u(String(p || ""), h, f));
        }
    }
    if (f.type === "element") {
      let h = n ? !n.includes(f.tagName) : s ? s.includes(f.tagName) : !1;
      if (!h && r && typeof c == "number" && (h = !r(f, c, d)), h && d && typeof c == "number")
        return a && f.children ? d.children.splice(c, 1, ...f.children) : d.children.splice(c, 1), c;
    }
  }
}
function Zf(e) {
  const t = e.indexOf(":"), n = e.indexOf("?"), r = e.indexOf("#"), i = e.indexOf("/");
  return (
    // If there is no protocol, it’s relative.
    t === -1 || // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
    i !== -1 && t > i || n !== -1 && t > n || r !== -1 && t > r || // It is a protocol, it should be allowed.
    Wf.test(e.slice(0, t)) ? e : ""
  );
}
function Ai(e, t) {
  const n = String(e);
  if (typeof t != "string")
    throw new TypeError("Expected character");
  let r = 0, i = n.indexOf(t);
  for (; i !== -1; )
    r++, i = n.indexOf(t, i + t.length);
  return r;
}
function eh(e) {
  if (typeof e != "string")
    throw new TypeError("Expected a string");
  return e.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}
function th(e, t, n) {
  const i = Xt((n || {}).ignore || []), s = nh(t);
  let o = -1;
  for (; ++o < s.length; )
    Bs(e, "text", a);
  function a(l, f) {
    let c = -1, d;
    for (; ++c < f.length; ) {
      const h = f[c], p = d ? d.children : void 0;
      if (i(
        h,
        p ? p.indexOf(h) : void 0,
        d
      ))
        return;
      d = h;
    }
    if (d)
      return u(l, f);
  }
  function u(l, f) {
    const c = f[f.length - 1], d = s[o][0], h = s[o][1];
    let p = 0;
    const k = c.children.indexOf(l);
    let b = !1, S = [];
    d.lastIndex = 0;
    let w = d.exec(l.value);
    for (; w; ) {
      const I = w.index, R = {
        index: w.index,
        input: w.input,
        stack: [...f, l]
      };
      let C = h(...w, R);
      if (typeof C == "string" && (C = C.length > 0 ? { type: "text", value: C } : void 0), C === !1 ? d.lastIndex = I + 1 : (p !== I && S.push({
        type: "text",
        value: l.value.slice(p, I)
      }), Array.isArray(C) ? S.push(...C) : C && S.push(C), p = I + w[0].length, b = !0), !d.global)
        break;
      w = d.exec(l.value);
    }
    return b ? (p < l.value.length && S.push({ type: "text", value: l.value.slice(p) }), c.children.splice(k, 1, ...S)) : S = [l], k + S.length;
  }
}
function nh(e) {
  const t = [];
  if (!Array.isArray(e))
    throw new TypeError("Expected find and replace tuple or list of tuples");
  const n = !e[0] || Array.isArray(e[0]) ? e : [e];
  let r = -1;
  for (; ++r < n.length; ) {
    const i = n[r];
    t.push([rh(i[0]), ih(i[1])]);
  }
  return t;
}
function rh(e) {
  return typeof e == "string" ? new RegExp(eh(e), "g") : e;
}
function ih(e) {
  return typeof e == "function" ? e : function() {
    return e;
  };
}
const Sn = "phrasing", Cn = ["autolink", "link", "image", "label"];
function sh() {
  return {
    transforms: [hh],
    enter: {
      literalAutolink: ah,
      literalAutolinkEmail: En,
      literalAutolinkHttp: En,
      literalAutolinkWww: En
    },
    exit: {
      literalAutolink: fh,
      literalAutolinkEmail: ch,
      literalAutolinkHttp: lh,
      literalAutolinkWww: uh
    }
  };
}
function oh() {
  return {
    unsafe: [
      {
        character: "@",
        before: "[+\\-.\\w]",
        after: "[\\-.\\w]",
        inConstruct: Sn,
        notInConstruct: Cn
      },
      {
        character: ".",
        before: "[Ww]",
        after: "[\\-.\\w]",
        inConstruct: Sn,
        notInConstruct: Cn
      },
      {
        character: ":",
        before: "[ps]",
        after: "\\/",
        inConstruct: Sn,
        notInConstruct: Cn
      }
    ]
  };
}
function ah(e) {
  this.enter({ type: "link", title: null, url: "", children: [] }, e);
}
function En(e) {
  this.config.enter.autolinkProtocol.call(this, e);
}
function lh(e) {
  this.config.exit.autolinkProtocol.call(this, e);
}
function uh(e) {
  this.config.exit.data.call(this, e);
  const t = this.stack[this.stack.length - 1];
  t.type, t.url = "http://" + this.sliceSerialize(e);
}
function ch(e) {
  this.config.exit.autolinkEmail.call(this, e);
}
function fh(e) {
  this.exit(e);
}
function hh(e) {
  th(
    e,
    [
      [/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi, dh],
      [/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu, ph]
    ],
    { ignore: ["link", "linkReference"] }
  );
}
function dh(e, t, n, r, i) {
  let s = "";
  if (!Hs(i) || (/^w/i.test(t) && (n = t + n, t = "", s = "http://"), !gh(n)))
    return !1;
  const o = mh(n + r);
  if (!o[0]) return !1;
  const a = {
    type: "link",
    title: null,
    url: s + t + o[0],
    children: [{ type: "text", value: t + o[0] }]
  };
  return o[1] ? [a, { type: "text", value: o[1] }] : a;
}
function ph(e, t, n, r) {
  return (
    // Not an expected previous character.
    !Hs(r, !0) || // Label ends in not allowed character.
    /[-\d_]$/.test(n) ? !1 : {
      type: "link",
      title: null,
      url: "mailto:" + t + "@" + n,
      children: [{ type: "text", value: t + "@" + n }]
    }
  );
}
function gh(e) {
  const t = e.split(".");
  return !(t.length < 2 || t[t.length - 1] && (/_/.test(t[t.length - 1]) || !/[a-zA-Z\d]/.test(t[t.length - 1])) || t[t.length - 2] && (/_/.test(t[t.length - 2]) || !/[a-zA-Z\d]/.test(t[t.length - 2])));
}
function mh(e) {
  const t = /[!"&'),.:;<>?\]}]+$/.exec(e);
  if (!t)
    return [e, void 0];
  e = e.slice(0, t.index);
  let n = t[0], r = n.indexOf(")");
  const i = Ai(e, "(");
  let s = Ai(e, ")");
  for (; r !== -1 && i > s; )
    e += n.slice(0, r + 1), n = n.slice(r + 1), r = n.indexOf(")"), s++;
  return [e, n];
}
function Hs(e, t) {
  const n = e.input.charCodeAt(e.index - 1);
  return (e.index === 0 || We(n) || Jt(n)) && // If it’s an email, the previous character should not be a slash.
  (!t || n !== 47);
}
Us.peek = Eh;
function yh() {
  this.buffer();
}
function bh(e) {
  this.enter({ type: "footnoteReference", identifier: "", label: "" }, e);
}
function xh() {
  this.buffer();
}
function kh(e) {
  this.enter(
    { type: "footnoteDefinition", identifier: "", label: "", children: [] },
    e
  );
}
function wh(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = Ee(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function vh(e) {
  this.exit(e);
}
function Sh(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = Ee(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function Ch(e) {
  this.exit(e);
}
function Eh() {
  return "[";
}
function Us(e, t, n, r) {
  const i = n.createTracker(r);
  let s = i.move("[^");
  const o = n.enter("footnoteReference"), a = n.enter("reference");
  return s += i.move(
    n.safe(n.associationId(e), { after: "]", before: s })
  ), a(), o(), s += i.move("]"), s;
}
function Ih() {
  return {
    enter: {
      gfmFootnoteCallString: yh,
      gfmFootnoteCall: bh,
      gfmFootnoteDefinitionLabelString: xh,
      gfmFootnoteDefinition: kh
    },
    exit: {
      gfmFootnoteCallString: wh,
      gfmFootnoteCall: vh,
      gfmFootnoteDefinitionLabelString: Sh,
      gfmFootnoteDefinition: Ch
    }
  };
}
function Th(e) {
  let t = !1;
  return e && e.firstLineBlank && (t = !0), {
    handlers: { footnoteDefinition: n, footnoteReference: Us },
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
        t ? qs : Nh
      )
    )), l(), u;
  }
}
function Nh(e, t, n) {
  return t === 0 ? e : qs(e, t, n);
}
function qs(e, t, n) {
  return (n ? "" : "    ") + e;
}
const Lh = [
  "autolink",
  "destinationLiteral",
  "destinationRaw",
  "reference",
  "titleQuote",
  "titleApostrophe"
];
Ks.peek = _h;
function Ah() {
  return {
    canContainEols: ["delete"],
    enter: { strikethrough: Oh },
    exit: { strikethrough: Ph }
  };
}
function Rh() {
  return {
    unsafe: [
      {
        character: "~",
        inConstruct: "phrasing",
        notInConstruct: Lh
      }
    ],
    handlers: { delete: Ks }
  };
}
function Oh(e) {
  this.enter({ type: "delete", children: [] }, e);
}
function Ph(e) {
  this.exit(e);
}
function Ks(e, t, n, r) {
  const i = n.createTracker(r), s = n.enter("strikethrough");
  let o = i.move("~~");
  return o += n.containerPhrasing(e, {
    ...i.current(),
    before: o,
    after: "~"
  }), o += i.move("~~"), s(), o;
}
function _h() {
  return "~";
}
function Dh(e) {
  return e.length;
}
function Fh(e, t) {
  const n = t || {}, r = (n.align || []).concat(), i = n.stringLength || Dh, s = [], o = [], a = [], u = [];
  let l = 0, f = -1;
  for (; ++f < e.length; ) {
    const g = [], k = [];
    let b = -1;
    for (e[f].length > l && (l = e[f].length); ++b < e[f].length; ) {
      const S = Mh(e[f][b]);
      if (n.alignDelimiters !== !1) {
        const w = i(S);
        k[b] = w, (u[b] === void 0 || w > u[b]) && (u[b] = w);
      }
      g.push(S);
    }
    o[f] = g, a[f] = k;
  }
  let c = -1;
  if (typeof r == "object" && "length" in r)
    for (; ++c < l; )
      s[c] = Ri(r[c]);
  else {
    const g = Ri(r);
    for (; ++c < l; )
      s[c] = g;
  }
  c = -1;
  const d = [], h = [];
  for (; ++c < l; ) {
    const g = s[c];
    let k = "", b = "";
    g === 99 ? (k = ":", b = ":") : g === 108 ? k = ":" : g === 114 && (b = ":");
    let S = n.alignDelimiters === !1 ? 1 : Math.max(
      1,
      u[c] - k.length - b.length
    );
    const w = k + "-".repeat(S) + b;
    n.alignDelimiters !== !1 && (S = k.length + S + b.length, S > u[c] && (u[c] = S), h[c] = S), d[c] = w;
  }
  o.splice(1, 0, d), a.splice(1, 0, h), f = -1;
  const p = [];
  for (; ++f < o.length; ) {
    const g = o[f], k = a[f];
    c = -1;
    const b = [];
    for (; ++c < l; ) {
      const S = g[c] || "";
      let w = "", I = "";
      if (n.alignDelimiters !== !1) {
        const R = u[c] - (k[c] || 0), C = s[c];
        C === 114 ? w = " ".repeat(R) : C === 99 ? R % 2 ? (w = " ".repeat(R / 2 + 0.5), I = " ".repeat(R / 2 - 0.5)) : (w = " ".repeat(R / 2), I = w) : I = " ".repeat(R);
      }
      n.delimiterStart !== !1 && !c && b.push("|"), n.padding !== !1 && // Don’t add the opening space if we’re not aligning and the cell is
      // empty: there will be a closing space.
      !(n.alignDelimiters === !1 && S === "") && (n.delimiterStart !== !1 || c) && b.push(" "), n.alignDelimiters !== !1 && b.push(w), b.push(S), n.alignDelimiters !== !1 && b.push(I), n.padding !== !1 && b.push(" "), (n.delimiterEnd !== !1 || c !== l - 1) && b.push("|");
    }
    p.push(
      n.delimiterEnd === !1 ? b.join("").replace(/ +$/, "") : b.join("")
    );
  }
  return p.join(`
`);
}
function Mh(e) {
  return e == null ? "" : String(e);
}
function Ri(e) {
  const t = typeof e == "string" ? e.codePointAt(0) : 0;
  return t === 67 || t === 99 ? 99 : t === 76 || t === 108 ? 108 : t === 82 || t === 114 ? 114 : 0;
}
function zh(e, t, n, r) {
  const i = n.enter("blockquote"), s = n.createTracker(r);
  s.move("> "), s.shift(2);
  const o = n.indentLines(
    n.containerFlow(e, s.current()),
    jh
  );
  return i(), o;
}
function jh(e, t, n) {
  return ">" + (n ? "" : " ") + e;
}
function $h(e, t) {
  return Oi(e, t.inConstruct, !0) && !Oi(e, t.notInConstruct, !1);
}
function Oi(e, t, n) {
  if (typeof t == "string" && (t = [t]), !t || t.length === 0)
    return n;
  let r = -1;
  for (; ++r < t.length; )
    if (e.includes(t[r]))
      return !0;
  return !1;
}
function Pi(e, t, n, r) {
  let i = -1;
  for (; ++i < n.unsafe.length; )
    if (n.unsafe[i].character === `
` && $h(n.stack, n.unsafe[i]))
      return /[ \t]/.test(r.before) ? "" : " ";
  return `\\
`;
}
function Bh(e, t) {
  const n = String(e);
  let r = n.indexOf(t), i = r, s = 0, o = 0;
  if (typeof t != "string")
    throw new TypeError("Expected substring");
  for (; r !== -1; )
    r === i ? ++s > o && (o = s) : s = 1, i = r + t.length, r = n.indexOf(t, i);
  return o;
}
function Vh(e, t) {
  return !!(t.options.fences === !1 && e.value && // If there’s no info…
  !e.lang && // And there’s a non-whitespace character…
  /[^ \r\n]/.test(e.value) && // And the value doesn’t start or end in a blank…
  !/^[\t ]*(?:[\r\n]|$)|(?:^|[\r\n])[\t ]*$/.test(e.value));
}
function Hh(e) {
  const t = e.options.fence || "`";
  if (t !== "`" && t !== "~")
    throw new Error(
      "Cannot serialize code with `" + t + "` for `options.fence`, expected `` ` `` or `~`"
    );
  return t;
}
function Uh(e, t, n, r) {
  const i = Hh(n), s = e.value || "", o = i === "`" ? "GraveAccent" : "Tilde";
  if (Vh(e, n)) {
    const c = n.enter("codeIndented"), d = n.indentLines(s, qh);
    return c(), d;
  }
  const a = n.createTracker(r), u = i.repeat(Math.max(Bh(s, i) + 1, 3)), l = n.enter("codeFenced");
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
function qh(e, t, n) {
  return (n ? "" : "    ") + e;
}
function pr(e) {
  const t = e.options.quote || '"';
  if (t !== '"' && t !== "'")
    throw new Error(
      "Cannot serialize title with `" + t + "` for `options.quote`, expected `\"`, or `'`"
    );
  return t;
}
function Kh(e, t, n, r) {
  const i = pr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.enter("definition");
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
function Wh(e) {
  const t = e.options.emphasis || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize emphasis with `" + t + "` for `options.emphasis`, expected `*`, or `_`"
    );
  return t;
}
function It(e) {
  return "&#x" + e.toString(16).toUpperCase() + ";";
}
function Kt(e, t, n) {
  const r = st(e), i = st(t);
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
Ws.peek = Gh;
function Ws(e, t, n, r) {
  const i = Wh(n), s = n.enter("emphasis"), o = n.createTracker(r), a = o.move(i);
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
  f.inside && (u = It(l) + u.slice(1));
  const c = u.charCodeAt(u.length - 1), d = Kt(r.after.charCodeAt(0), c, i);
  d.inside && (u = u.slice(0, -1) + It(c));
  const h = o.move(i);
  return s(), n.attentionEncodeSurroundingInfo = {
    after: d.outside,
    before: f.outside
  }, a + u + h;
}
function Gh(e, t, n) {
  return n.options.emphasis || "*";
}
function Jh(e, t) {
  let n = !1;
  return hr(e, function(r) {
    if ("value" in r && /\r?\n|\r/.test(r.value) || r.type === "break")
      return n = !0, Bn;
  }), !!((!e.depth || e.depth < 3) && sr(e) && (t.options.setext || n));
}
function Yh(e, t, n, r) {
  const i = Math.max(Math.min(6, e.depth || 1), 1), s = n.createTracker(r);
  if (Jh(e, n)) {
    const f = n.enter("headingSetext"), c = n.enter("phrasing"), d = n.containerPhrasing(e, {
      ...s.current(),
      before: `
`,
      after: `
`
    });
    return c(), f(), d + `
` + (i === 1 ? "=" : "-").repeat(
      // The whole size…
      d.length - // Minus the position of the character after the last EOL (or
      // 0 if there is none)…
      (Math.max(d.lastIndexOf("\r"), d.lastIndexOf(`
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
  return /^[\t ]/.test(l) && (l = It(l.charCodeAt(0)) + l.slice(1)), l = l ? o + " " + l : o, n.options.closeAtx && (l += " " + o), u(), a(), l;
}
Gs.peek = Qh;
function Gs(e) {
  return e.value || "";
}
function Qh() {
  return "<";
}
Js.peek = Xh;
function Js(e, t, n, r) {
  const i = pr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.enter("image");
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
function Xh() {
  return "!";
}
Ys.peek = Zh;
function Ys(e, t, n, r) {
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
function Zh() {
  return "!";
}
Qs.peek = ed;
function Qs(e, t, n) {
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
function ed() {
  return "`";
}
function Xs(e, t) {
  const n = sr(e);
  return !!(!t.options.resourceLink && // If there’s a url…
  e.url && // And there’s a no title…
  !e.title && // And the content of `node` is a single text node…
  e.children && e.children.length === 1 && e.children[0].type === "text" && // And if the url is the same as the content…
  (n === e.url || "mailto:" + n === e.url) && // And that starts w/ a protocol…
  /^[a-z][a-z+.-]+:/i.test(e.url) && // And that doesn’t contain ASCII control codes (character escapes and
  // references don’t work), space, or angle brackets…
  !/[\0- <>\u007F]/.test(e.url));
}
Zs.peek = td;
function Zs(e, t, n, r) {
  const i = pr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.createTracker(r);
  let a, u;
  if (Xs(e, n)) {
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
function td(e, t, n) {
  return Xs(e, n) ? "<" : "[";
}
eo.peek = nd;
function eo(e, t, n, r) {
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
function nd() {
  return "[";
}
function gr(e) {
  const t = e.options.bullet || "*";
  if (t !== "*" && t !== "+" && t !== "-")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bullet`, expected `*`, `+`, or `-`"
    );
  return t;
}
function rd(e) {
  const t = gr(e), n = e.options.bulletOther;
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
function id(e) {
  const t = e.options.bulletOrdered || ".";
  if (t !== "." && t !== ")")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bulletOrdered`, expected `.` or `)`"
    );
  return t;
}
function to(e) {
  const t = e.options.rule || "*";
  if (t !== "*" && t !== "-" && t !== "_")
    throw new Error(
      "Cannot serialize rules with `" + t + "` for `options.rule`, expected `*`, `-`, or `_`"
    );
  return t;
}
function sd(e, t, n, r) {
  const i = n.enter("list"), s = n.bulletCurrent;
  let o = e.ordered ? id(n) : gr(n);
  const a = e.ordered ? o === "." ? ")" : "." : rd(n);
  let u = t && n.bulletLastUsed ? o === n.bulletLastUsed : !1;
  if (!e.ordered) {
    const f = e.children ? e.children[0] : void 0;
    if (
      // Bullet could be used as a thematic break marker:
      (o === "*" || o === "-") && // Empty first list item:
      f && (!f.children || !f.children[0]) && // Directly in two other list items:
      n.stack[n.stack.length - 1] === "list" && n.stack[n.stack.length - 2] === "listItem" && n.stack[n.stack.length - 3] === "list" && n.stack[n.stack.length - 4] === "listItem" && // That are each the first child.
      n.indexStack[n.indexStack.length - 1] === 0 && n.indexStack[n.indexStack.length - 2] === 0 && n.indexStack[n.indexStack.length - 3] === 0 && (u = !0), to(n) === o && f
    ) {
      let c = -1;
      for (; ++c < e.children.length; ) {
        const d = e.children[c];
        if (d && d.type === "listItem" && d.children && d.children[0] && d.children[0].type === "thematicBreak") {
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
function od(e) {
  const t = e.options.listItemIndent || "one";
  if (t !== "tab" && t !== "one" && t !== "mixed")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.listItemIndent`, expected `tab`, `one`, or `mixed`"
    );
  return t;
}
function ad(e, t, n, r) {
  const i = od(n);
  let s = n.bulletCurrent || gr(n);
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
  function f(c, d, h) {
    return d ? (h ? "" : " ".repeat(o)) + c : (h ? s : s + " ".repeat(o - s.length)) + c;
  }
}
function ld(e, t, n, r) {
  const i = n.enter("paragraph"), s = n.enter("phrasing"), o = n.containerPhrasing(e, r);
  return s(), i(), o;
}
const ud = (
  /** @type {(node?: unknown) => node is Exclude<PhrasingContent, Html>} */
  Xt([
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
function cd(e, t, n, r) {
  return (e.children.some(function(o) {
    return ud(o);
  }) ? n.containerPhrasing : n.containerFlow).call(n, e, r);
}
function fd(e) {
  const t = e.options.strong || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize strong with `" + t + "` for `options.strong`, expected `*`, or `_`"
    );
  return t;
}
no.peek = hd;
function no(e, t, n, r) {
  const i = fd(n), s = n.enter("strong"), o = n.createTracker(r), a = o.move(i + i);
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
  f.inside && (u = It(l) + u.slice(1));
  const c = u.charCodeAt(u.length - 1), d = Kt(r.after.charCodeAt(0), c, i);
  d.inside && (u = u.slice(0, -1) + It(c));
  const h = o.move(i + i);
  return s(), n.attentionEncodeSurroundingInfo = {
    after: d.outside,
    before: f.outside
  }, a + u + h;
}
function hd(e, t, n) {
  return n.options.strong || "*";
}
function dd(e, t, n, r) {
  return n.safe(e.value, r);
}
function pd(e) {
  const t = e.options.ruleRepetition || 3;
  if (t < 3)
    throw new Error(
      "Cannot serialize rules with repetition `" + t + "` for `options.ruleRepetition`, expected `3` or more"
    );
  return t;
}
function gd(e, t, n) {
  const r = (to(n) + (n.options.ruleSpaces ? " " : "")).repeat(pd(n));
  return n.options.ruleSpaces ? r.slice(0, -1) : r;
}
const ro = {
  blockquote: zh,
  break: Pi,
  code: Uh,
  definition: Kh,
  emphasis: Ws,
  hardBreak: Pi,
  heading: Yh,
  html: Gs,
  image: Js,
  imageReference: Ys,
  inlineCode: Qs,
  link: Zs,
  linkReference: eo,
  list: sd,
  listItem: ad,
  paragraph: ld,
  root: cd,
  strong: no,
  text: dd,
  thematicBreak: gd
};
function md() {
  return {
    enter: {
      table: yd,
      tableData: _i,
      tableHeader: _i,
      tableRow: xd
    },
    exit: {
      codeText: kd,
      table: bd,
      tableData: In,
      tableHeader: In,
      tableRow: In
    }
  };
}
function yd(e) {
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
function bd(e) {
  this.exit(e), this.data.inTable = void 0;
}
function xd(e) {
  this.enter({ type: "tableRow", children: [] }, e);
}
function In(e) {
  this.exit(e);
}
function _i(e) {
  this.enter({ type: "tableCell", children: [] }, e);
}
function kd(e) {
  let t = this.resume();
  this.data.inTable && (t = t.replace(/\\([\\|])/g, wd));
  const n = this.stack[this.stack.length - 1];
  n.type, n.value = t, this.exit(e);
}
function wd(e, t) {
  return t === "|" ? t : e;
}
function vd(e) {
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
      inlineCode: d,
      table: o,
      tableCell: u,
      tableRow: a
    }
  };
  function o(h, p, g, k) {
    return l(f(h, g, k), h.align);
  }
  function a(h, p, g, k) {
    const b = c(h, g, k), S = l([b]);
    return S.slice(0, S.indexOf(`
`));
  }
  function u(h, p, g, k) {
    const b = g.enter("tableCell"), S = g.enter("phrasing"), w = g.containerPhrasing(h, {
      ...k,
      before: s,
      after: s
    });
    return S(), b(), w;
  }
  function l(h, p) {
    return Fh(h, {
      align: p,
      // @ts-expect-error: `markdown-table` types should support `null`.
      alignDelimiters: r,
      // @ts-expect-error: `markdown-table` types should support `null`.
      padding: n,
      // @ts-expect-error: `markdown-table` types should support `null`.
      stringLength: i
    });
  }
  function f(h, p, g) {
    const k = h.children;
    let b = -1;
    const S = [], w = p.enter("table");
    for (; ++b < k.length; )
      S[b] = c(k[b], p, g);
    return w(), S;
  }
  function c(h, p, g) {
    const k = h.children;
    let b = -1;
    const S = [], w = p.enter("tableRow");
    for (; ++b < k.length; )
      S[b] = u(k[b], h, p, g);
    return w(), S;
  }
  function d(h, p, g) {
    let k = ro.inlineCode(h, p, g);
    return g.stack.includes("tableCell") && (k = k.replace(/\|/g, "\\$&")), k;
  }
}
function Sd() {
  return {
    exit: {
      taskListCheckValueChecked: Di,
      taskListCheckValueUnchecked: Di,
      paragraph: Ed
    }
  };
}
function Cd() {
  return {
    unsafe: [{ atBreak: !0, character: "-", after: "[:|-]" }],
    handlers: { listItem: Id }
  };
}
function Di(e) {
  const t = this.stack[this.stack.length - 2];
  t.type, t.checked = e.type === "taskListCheckValueChecked";
}
function Ed(e) {
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
function Id(e, t, n, r) {
  const i = e.children[0], s = typeof e.checked == "boolean" && i && i.type === "paragraph", o = "[" + (e.checked ? "x" : " ") + "] ", a = n.createTracker(r);
  s && a.move(o);
  let u = ro.listItem(e, t, n, {
    ...r,
    ...a.current()
  });
  return s && (u = u.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/, l)), u;
  function l(f) {
    return f + o;
  }
}
function Td() {
  return [
    sh(),
    Ih(),
    Ah(),
    md(),
    Sd()
  ];
}
function Nd(e) {
  return {
    extensions: [
      oh(),
      Th(e),
      Rh(),
      vd(e),
      Cd()
    ]
  };
}
const Ld = {
  tokenize: Dd,
  partial: !0
}, io = {
  tokenize: Fd,
  partial: !0
}, so = {
  tokenize: Md,
  partial: !0
}, oo = {
  tokenize: zd,
  partial: !0
}, Ad = {
  tokenize: jd,
  partial: !0
}, ao = {
  name: "wwwAutolink",
  tokenize: Pd,
  previous: uo
}, lo = {
  name: "protocolAutolink",
  tokenize: _d,
  previous: co
}, _e = {
  name: "emailAutolink",
  tokenize: Od,
  previous: fo
}, Ne = {};
function Rd() {
  return {
    text: Ne
  };
}
let Ve = 48;
for (; Ve < 123; )
  Ne[Ve] = _e, Ve++, Ve === 58 ? Ve = 65 : Ve === 91 && (Ve = 97);
Ne[43] = _e;
Ne[45] = _e;
Ne[46] = _e;
Ne[95] = _e;
Ne[72] = [_e, lo];
Ne[104] = [_e, lo];
Ne[87] = [_e, ao];
Ne[119] = [_e, ao];
function Od(e, t, n) {
  const r = this;
  let i, s;
  return o;
  function o(c) {
    return !qn(c) || !fo.call(r, r.previous) || mr(r.events) ? n(c) : (e.enter("literalAutolink"), e.enter("literalAutolinkEmail"), a(c));
  }
  function a(c) {
    return qn(c) ? (e.consume(c), a) : c === 64 ? (e.consume(c), u) : n(c);
  }
  function u(c) {
    return c === 46 ? e.check(Ad, f, l)(c) : c === 45 || c === 95 || le(c) ? (s = !0, e.consume(c), u) : f(c);
  }
  function l(c) {
    return e.consume(c), i = !0, u;
  }
  function f(c) {
    return s && i && ce(r.previous) ? (e.exit("literalAutolinkEmail"), e.exit("literalAutolink"), t(c)) : n(c);
  }
}
function Pd(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return o !== 87 && o !== 119 || !uo.call(r, r.previous) || mr(r.events) ? n(o) : (e.enter("literalAutolink"), e.enter("literalAutolinkWww"), e.check(Ld, e.attempt(io, e.attempt(so, s), n), n)(o));
  }
  function s(o) {
    return e.exit("literalAutolinkWww"), e.exit("literalAutolink"), t(o);
  }
}
function _d(e, t, n) {
  const r = this;
  let i = "", s = !1;
  return o;
  function o(c) {
    return (c === 72 || c === 104) && co.call(r, r.previous) && !mr(r.events) ? (e.enter("literalAutolink"), e.enter("literalAutolinkHttp"), i += String.fromCodePoint(c), e.consume(c), a) : n(c);
  }
  function a(c) {
    if (ce(c) && i.length < 5)
      return i += String.fromCodePoint(c), e.consume(c), a;
    if (c === 58) {
      const d = i.toLowerCase();
      if (d === "http" || d === "https")
        return e.consume(c), u;
    }
    return n(c);
  }
  function u(c) {
    return c === 47 ? (e.consume(c), s ? l : (s = !0, u)) : n(c);
  }
  function l(c) {
    return c === null || Ht(c) || X(c) || We(c) || Jt(c) ? n(c) : e.attempt(io, e.attempt(so, f), n)(c);
  }
  function f(c) {
    return e.exit("literalAutolinkHttp"), e.exit("literalAutolink"), t(c);
  }
}
function Dd(e, t, n) {
  let r = 0;
  return i;
  function i(o) {
    return (o === 87 || o === 119) && r < 3 ? (r++, e.consume(o), i) : o === 46 && r === 3 ? (e.consume(o), s) : n(o);
  }
  function s(o) {
    return o === null ? n(o) : t(o);
  }
}
function Fd(e, t, n) {
  let r, i, s;
  return o;
  function o(l) {
    return l === 46 || l === 95 ? e.check(oo, u, a)(l) : l === null || X(l) || We(l) || l !== 45 && Jt(l) ? u(l) : (s = !0, e.consume(l), o);
  }
  function a(l) {
    return l === 95 ? r = !0 : (i = r, r = void 0), e.consume(l), o;
  }
  function u(l) {
    return i || r || !s ? n(l) : t(l);
  }
}
function Md(e, t) {
  let n = 0, r = 0;
  return i;
  function i(o) {
    return o === 40 ? (n++, e.consume(o), i) : o === 41 && r < n ? s(o) : o === 33 || o === 34 || o === 38 || o === 39 || o === 41 || o === 42 || o === 44 || o === 46 || o === 58 || o === 59 || o === 60 || o === 63 || o === 93 || o === 95 || o === 126 ? e.check(oo, t, s)(o) : o === null || X(o) || We(o) ? t(o) : (e.consume(o), i);
  }
  function s(o) {
    return o === 41 && r++, e.consume(o), i;
  }
}
function zd(e, t, n) {
  return r;
  function r(a) {
    return a === 33 || a === 34 || a === 39 || a === 41 || a === 42 || a === 44 || a === 46 || a === 58 || a === 59 || a === 63 || a === 95 || a === 126 ? (e.consume(a), r) : a === 38 ? (e.consume(a), s) : a === 93 ? (e.consume(a), i) : (
      // `<` is an end.
      a === 60 || // So is whitespace.
      a === null || X(a) || We(a) ? t(a) : n(a)
    );
  }
  function i(a) {
    return a === null || a === 40 || a === 91 || X(a) || We(a) ? t(a) : r(a);
  }
  function s(a) {
    return ce(a) ? o(a) : n(a);
  }
  function o(a) {
    return a === 59 ? (e.consume(a), r) : ce(a) ? (e.consume(a), o) : n(a);
  }
}
function jd(e, t, n) {
  return r;
  function r(s) {
    return e.consume(s), i;
  }
  function i(s) {
    return le(s) ? n(s) : t(s);
  }
}
function uo(e) {
  return e === null || e === 40 || e === 42 || e === 95 || e === 91 || e === 93 || e === 126 || X(e);
}
function co(e) {
  return !ce(e);
}
function fo(e) {
  return !(e === 47 || qn(e));
}
function qn(e) {
  return e === 43 || e === 45 || e === 46 || e === 95 || le(e);
}
function mr(e) {
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
const $d = {
  tokenize: Gd,
  partial: !0
};
function Bd() {
  return {
    document: {
      91: {
        name: "gfmFootnoteDefinition",
        tokenize: qd,
        continuation: {
          tokenize: Kd
        },
        exit: Wd
      }
    },
    text: {
      91: {
        name: "gfmFootnoteCall",
        tokenize: Ud
      },
      93: {
        name: "gfmPotentialFootnoteCall",
        add: "after",
        tokenize: Vd,
        resolveTo: Hd
      }
    }
  };
}
function Vd(e, t, n) {
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
    const l = Ee(r.sliceSerialize({
      start: o.end,
      end: r.now()
    }));
    return l.codePointAt(0) !== 94 || !s.includes(l.slice(1)) ? n(u) : (e.enter("gfmFootnoteCallLabelMarker"), e.consume(u), e.exit("gfmFootnoteCallLabelMarker"), t(u));
  }
}
function Hd(e, t) {
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
function Ud(e, t, n) {
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
      c === null || c === 91 || X(c)
    )
      return n(c);
    if (c === 93) {
      e.exit("chunkString");
      const d = e.exit("gfmFootnoteCallString");
      return i.includes(Ee(r.sliceSerialize(d))) ? (e.enter("gfmFootnoteCallLabelMarker"), e.consume(c), e.exit("gfmFootnoteCallLabelMarker"), e.exit("gfmFootnoteCall"), t) : n(c);
    }
    return X(c) || (o = !0), s++, e.consume(c), c === 92 ? f : l;
  }
  function f(c) {
    return c === 91 || c === 92 || c === 93 ? (e.consume(c), s++, l) : l(c);
  }
}
function qd(e, t, n) {
  const r = this, i = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let s, o = 0, a;
  return u;
  function u(p) {
    return e.enter("gfmFootnoteDefinition")._container = !0, e.enter("gfmFootnoteDefinitionLabel"), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionLabelMarker"), l;
  }
  function l(p) {
    return p === 94 ? (e.enter("gfmFootnoteDefinitionMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionMarker"), e.enter("gfmFootnoteDefinitionLabelString"), e.enter("chunkString").contentType = "string", f) : n(p);
  }
  function f(p) {
    if (
      // Too long.
      o > 999 || // Closing brace with nothing.
      p === 93 && !a || // Space or tab is not supported by GFM for some reason.
      // `\n` and `[` not being supported makes sense.
      p === null || p === 91 || X(p)
    )
      return n(p);
    if (p === 93) {
      e.exit("chunkString");
      const g = e.exit("gfmFootnoteDefinitionLabelString");
      return s = Ee(r.sliceSerialize(g)), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionLabelMarker"), e.exit("gfmFootnoteDefinitionLabel"), d;
    }
    return X(p) || (a = !0), o++, e.consume(p), p === 92 ? c : f;
  }
  function c(p) {
    return p === 91 || p === 92 || p === 93 ? (e.consume(p), o++, f) : f(p);
  }
  function d(p) {
    return p === 58 ? (e.enter("definitionMarker"), e.consume(p), e.exit("definitionMarker"), i.includes(s) || i.push(s), K(e, h, "gfmFootnoteDefinitionWhitespace")) : n(p);
  }
  function h(p) {
    return t(p);
  }
}
function Kd(e, t, n) {
  return e.check(Nt, t, e.attempt($d, t, n));
}
function Wd(e) {
  e.exit("gfmFootnoteDefinition");
}
function Gd(e, t, n) {
  const r = this;
  return K(e, i, "gfmFootnoteDefinitionIndent", 5);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return o && o[1].type === "gfmFootnoteDefinitionIndent" && o[2].sliceSerialize(o[1], !0).length === 4 ? t(s) : n(s);
  }
}
function Jd(e) {
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
            }, d = [["enter", f, a], ["enter", o[l][1], a], ["exit", o[l][1], a], ["enter", c, a]], h = a.parser.constructs.insideSpan.null;
            h && be(d, d.length, 0, Yt(h, o.slice(l + 1, u), a)), be(d, d.length, 0, [["exit", c, a], ["enter", o[u][1], a], ["exit", o[u][1], a], ["exit", f, a]]), be(o, l - 1, u - l + 3, d), u = l + d.length - 2;
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
    return d;
    function d(p) {
      return l === 126 && f[f.length - 1][1].type !== "characterEscape" ? u(p) : (o.enter("strikethroughSequenceTemporary"), h(p));
    }
    function h(p) {
      const g = st(l);
      if (p === 126)
        return c > 1 ? u(p) : (o.consume(p), c++, h);
      if (c < 2 && !n) return u(p);
      const k = o.exit("strikethroughSequenceTemporary"), b = st(p);
      return k._open = !b || b === 2 && !!g, k._close = !g || g === 2 && !!b, a(p);
    }
  }
}
class Yd {
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
    Qd(this, t, n, r);
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
function Qd(e, t, n, r) {
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
function Xd(e, t) {
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
function Zd() {
  return {
    flow: {
      null: {
        name: "table",
        tokenize: ep,
        resolveAll: tp
      }
    }
  };
}
function ep(e, t, n) {
  const r = this;
  let i = 0, s = 0, o;
  return a;
  function a(v) {
    let N = r.events.length - 1;
    for (; N > -1; ) {
      const D = r.events[N][1].type;
      if (D === "lineEnding" || // Note: markdown-rs uses `whitespace` instead of `linePrefix`
      D === "linePrefix") N--;
      else break;
    }
    const L = N > -1 ? r.events[N][1].type : null, F = L === "tableHead" || L === "tableRow" ? C : u;
    return F === C && r.parser.lazy[r.now().line] ? n(v) : F(v);
  }
  function u(v) {
    return e.enter("tableHead"), e.enter("tableRow"), l(v);
  }
  function l(v) {
    return v === 124 || (o = !0, s += 1), f(v);
  }
  function f(v) {
    return v === null ? n(v) : M(v) ? s > 1 ? (s = 0, r.interrupt = !0, e.exit("tableRow"), e.enter("lineEnding"), e.consume(v), e.exit("lineEnding"), h) : n(v) : U(v) ? K(e, f, "whitespace")(v) : (s += 1, o && (o = !1, i += 1), v === 124 ? (e.enter("tableCellDivider"), e.consume(v), e.exit("tableCellDivider"), o = !0, f) : (e.enter("data"), c(v)));
  }
  function c(v) {
    return v === null || v === 124 || X(v) ? (e.exit("data"), f(v)) : (e.consume(v), v === 92 ? d : c);
  }
  function d(v) {
    return v === 92 || v === 124 ? (e.consume(v), c) : c(v);
  }
  function h(v) {
    return r.interrupt = !1, r.parser.lazy[r.now().line] ? n(v) : (e.enter("tableDelimiterRow"), o = !1, U(v) ? K(e, p, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(v) : p(v));
  }
  function p(v) {
    return v === 45 || v === 58 ? k(v) : v === 124 ? (o = !0, e.enter("tableCellDivider"), e.consume(v), e.exit("tableCellDivider"), g) : R(v);
  }
  function g(v) {
    return U(v) ? K(e, k, "whitespace")(v) : k(v);
  }
  function k(v) {
    return v === 58 ? (s += 1, o = !0, e.enter("tableDelimiterMarker"), e.consume(v), e.exit("tableDelimiterMarker"), b) : v === 45 ? (s += 1, b(v)) : v === null || M(v) ? I(v) : R(v);
  }
  function b(v) {
    return v === 45 ? (e.enter("tableDelimiterFiller"), S(v)) : R(v);
  }
  function S(v) {
    return v === 45 ? (e.consume(v), S) : v === 58 ? (o = !0, e.exit("tableDelimiterFiller"), e.enter("tableDelimiterMarker"), e.consume(v), e.exit("tableDelimiterMarker"), w) : (e.exit("tableDelimiterFiller"), w(v));
  }
  function w(v) {
    return U(v) ? K(e, I, "whitespace")(v) : I(v);
  }
  function I(v) {
    return v === 124 ? p(v) : v === null || M(v) ? !o || i !== s ? R(v) : (e.exit("tableDelimiterRow"), e.exit("tableHead"), t(v)) : R(v);
  }
  function R(v) {
    return n(v);
  }
  function C(v) {
    return e.enter("tableRow"), z(v);
  }
  function z(v) {
    return v === 124 ? (e.enter("tableCellDivider"), e.consume(v), e.exit("tableCellDivider"), z) : v === null || M(v) ? (e.exit("tableRow"), t(v)) : U(v) ? K(e, z, "whitespace")(v) : (e.enter("data"), V(v));
  }
  function V(v) {
    return v === null || v === 124 || X(v) ? (e.exit("data"), z(v)) : (e.consume(v), v === 92 ? _ : V);
  }
  function _(v) {
    return v === 92 || v === 124 ? (e.consume(v), V) : V(v);
  }
}
function tp(e, t) {
  let n = -1, r = !0, i = 0, s = [0, 0, 0, 0], o = [0, 0, 0, 0], a = !1, u = 0, l, f, c;
  const d = new Yd();
  for (; ++n < e.length; ) {
    const h = e[n], p = h[1];
    h[0] === "enter" ? p.type === "tableHead" ? (a = !1, u !== 0 && (Fi(d, t, u, l, f), f = void 0, u = 0), l = {
      type: "table",
      start: Object.assign({}, p.start),
      // Note: correct end is set later.
      end: Object.assign({}, p.end)
    }, d.add(n, 0, [["enter", l, t]])) : p.type === "tableRow" || p.type === "tableDelimiterRow" ? (r = !0, c = void 0, s = [0, 0, 0, 0], o = [0, n + 1, 0, 0], a && (a = !1, f = {
      type: "tableBody",
      start: Object.assign({}, p.start),
      // Note: correct end is set later.
      end: Object.assign({}, p.end)
    }, d.add(n, 0, [["enter", f, t]])), i = p.type === "tableDelimiterRow" ? 2 : f ? 3 : 1) : i && (p.type === "data" || p.type === "tableDelimiterMarker" || p.type === "tableDelimiterFiller") ? (r = !1, o[2] === 0 && (s[1] !== 0 && (o[0] = o[1], c = Ft(d, t, s, i, void 0, c), s = [0, 0, 0, 0]), o[2] = n)) : p.type === "tableCellDivider" && (r ? r = !1 : (s[1] !== 0 && (o[0] = o[1], c = Ft(d, t, s, i, void 0, c)), s = o, o = [s[1], n, 0, 0])) : p.type === "tableHead" ? (a = !0, u = n) : p.type === "tableRow" || p.type === "tableDelimiterRow" ? (u = n, s[1] !== 0 ? (o[0] = o[1], c = Ft(d, t, s, i, n, c)) : o[1] !== 0 && (c = Ft(d, t, o, i, n, c)), i = 0) : i && (p.type === "data" || p.type === "tableDelimiterMarker" || p.type === "tableDelimiterFiller") && (o[3] = n);
  }
  for (u !== 0 && Fi(d, t, u, l, f), d.consume(t.events), n = -1; ++n < t.events.length; ) {
    const h = t.events[n];
    h[0] === "enter" && h[1].type === "table" && (h[1]._align = Xd(t.events, n));
  }
  return e;
}
function Ft(e, t, n, r, i, s) {
  const o = r === 1 ? "tableHeader" : r === 2 ? "tableDelimiter" : "tableData", a = "tableContent";
  n[0] !== 0 && (s.end = Object.assign({}, rt(t.events, n[0])), e.add(n[0], 0, [["exit", s, t]]));
  const u = rt(t.events, n[1]);
  if (s = {
    type: o,
    start: Object.assign({}, u),
    // Note: correct end is set later.
    end: Object.assign({}, u)
  }, e.add(n[1], 0, [["enter", s, t]]), n[2] !== 0) {
    const l = rt(t.events, n[2]), f = rt(t.events, n[3]), c = {
      type: a,
      start: Object.assign({}, l),
      end: Object.assign({}, f)
    };
    if (e.add(n[2], 0, [["enter", c, t]]), r !== 2) {
      const d = t.events[n[2]], h = t.events[n[3]];
      if (d[1].end = Object.assign({}, h[1].end), d[1].type = "chunkText", d[1].contentType = "text", n[3] > n[2] + 1) {
        const p = n[2] + 1, g = n[3] - n[2] - 1;
        e.add(p, g, []);
      }
    }
    e.add(n[3] + 1, 0, [["exit", c, t]]);
  }
  return i !== void 0 && (s.end = Object.assign({}, rt(t.events, i)), e.add(i, 0, [["exit", s, t]]), s = void 0), s;
}
function Fi(e, t, n, r, i) {
  const s = [], o = rt(t.events, n);
  i && (i.end = Object.assign({}, o), s.push(["exit", i, t])), r.end = Object.assign({}, o), s.push(["exit", r, t]), e.add(n + 1, 0, s);
}
function rt(e, t) {
  const n = e[t], r = n[0] === "enter" ? "start" : "end";
  return n[1][r];
}
const np = {
  name: "tasklistCheck",
  tokenize: ip
};
function rp() {
  return {
    text: {
      91: np
    }
  };
}
function ip(e, t, n) {
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
    return X(u) ? (e.enter("taskListCheckValueUnchecked"), e.consume(u), e.exit("taskListCheckValueUnchecked"), o) : u === 88 || u === 120 ? (e.enter("taskListCheckValueChecked"), e.consume(u), e.exit("taskListCheckValueChecked"), o) : n(u);
  }
  function o(u) {
    return u === 93 ? (e.enter("taskListCheckMarker"), e.consume(u), e.exit("taskListCheckMarker"), e.exit("taskListCheck"), a) : n(u);
  }
  function a(u) {
    return M(u) ? t(u) : U(u) ? e.check({
      tokenize: sp
    }, t, n)(u) : n(u);
  }
}
function sp(e, t, n) {
  return K(e, r, "whitespace");
  function r(i) {
    return i === null ? n(i) : t(i);
  }
}
function op(e) {
  return ws([
    Rd(),
    Bd(),
    Jd(e),
    Zd(),
    rp()
  ]);
}
const ap = {};
function lp(e) {
  const t = (
    /** @type {Processor<Root>} */
    this
  ), n = e || ap, r = t.data(), i = r.micromarkExtensions || (r.micromarkExtensions = []), s = r.fromMarkdownExtensions || (r.fromMarkdownExtensions = []), o = r.toMarkdownExtensions || (r.toMarkdownExtensions = []);
  i.push(op(n)), s.push(Td()), o.push(Nd(n));
}
const up = {
  a: ({ node: e, ...t }) => /* @__PURE__ */ x("a", { target: "_blank", rel: "noopener noreferrer", ...t }),
  // react-markdown v10 removed the `inline` prop; detect inline via the absence
  // of a language- className and of newlines (block code lives inside <pre>).
  code: ({ node: e, className: t, children: n, ...r }) => !/^language-/.test(t || "") && !String(n).includes(`
`) ? /* @__PURE__ */ x("code", { className: "fdv2-md-code-inline", ...r, children: n }) : /* @__PURE__ */ x("code", { className: t, ...r, children: n }),
  table: ({ node: e, ...t }) => /* @__PURE__ */ x("div", { className: "fdv2-md-table-wrap", children: /* @__PURE__ */ x("table", { ...t }) })
};
function cp({ children: e }) {
  return /* @__PURE__ */ x("div", { className: "fdv2-md", children: /* @__PURE__ */ x(Jf, { remarkPlugins: [lp], components: up, children: e || "" }) });
}
function Tn(e, t) {
  return t ? e === "beneficiary" ? `${t.name || t.userId}${t.email ? ` (${t.email})` : ""}` : t.name || t.code || "" : "";
}
function fp({ resolveChoices: e }) {
  const { t } = ee(), { loading: n } = we(), r = Pe(), [i, s] = ne(null), [o, a] = ne(""), { slotId: u, default: l, alternatives: f = [], allowSearch: c } = e, d = () => r.sendChoice({ slotId: u, action: "confirm", value: l }, Tn(u, l)), h = (g) => r.sendChoice({ slotId: u, action: "select", value: g }, Tn(u, g)), p = () => {
    const g = o.trim();
    g && r.sendChoice({ slotId: u, action: "search", value: g }, g);
  };
  return /* @__PURE__ */ P("div", { className: "fdv2-choice", children: [
    /* @__PURE__ */ P("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", onClick: d, disabled: n, children: t("choice.yes") }),
      f.length > 0 && /* @__PURE__ */ P("button", { type: "button", className: "fdv2-choice-btn", onClick: () => s(i === "list" ? null : "list"), disabled: n, children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      c && /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn", onClick: () => s(i === "search" ? null : "search"), disabled: n, children: t("choice.search") })
    ] }),
    i === "list" && /* @__PURE__ */ x("ul", { className: "fdv2-choice-list", children: f.map((g, k) => /* @__PURE__ */ x("li", { children: /* @__PURE__ */ x("button", { type: "button", onClick: () => h(g), disabled: n, children: Tn(u, g) }) }, g.userId || g.code || k)) }),
    i === "search" && /* @__PURE__ */ P("div", { className: "fdv2-choice-search", children: [
      /* @__PURE__ */ x(
        "input",
        {
          className: "fdv2-slot-input",
          value: o,
          onChange: (g) => a(g.target.value),
          onKeyDown: (g) => {
            g.key === "Enter" && (g.preventDefault(), p());
          },
          placeholder: t(u === "location" ? "choice.searchLocation" : "choice.searchUser"),
          disabled: n,
          autoFocus: !0
        }
      ),
      /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn", onClick: p, disabled: n || !o.trim(), children: t("choice.find") })
    ] })
  ] });
}
function Mi({ control: e, onPick: t }) {
  const { t: n } = ee(), { loading: r } = we(), i = e.source || {}, s = i.minChars || 2, o = i.directory || "user", [a, u] = ne(""), [l, f] = ne([]), [c, d] = ne(!1), h = ae(null);
  te(() => {
    const g = a.trim();
    if (g.length < s) {
      f([]), d(!1);
      return;
    }
    return d(!0), clearTimeout(h.current), h.current = setTimeout(async () => {
      try {
        const b = await (await Ge()(
          Qn(`/flowdesk/directory/${encodeURIComponent(o)}?q=${encodeURIComponent(g)}&limit=8`),
          { headers: await ze() }
        )).json().catch(() => ({}));
        f(Array.isArray(b.results) ? b.results : []);
      } catch {
        f([]);
      } finally {
        d(!1);
      }
    }, 300), () => clearTimeout(h.current);
  }, [a, s, o]);
  const p = i.placeholder || n(o === "location" ? "choice.searchLocation" : "choice.searchUser");
  return /* @__PURE__ */ P("div", { className: "fdv2-autocomplete fdv2-choice-search", children: [
    /* @__PURE__ */ x(
      "input",
      {
        className: "fdv2-slot-input",
        value: a,
        onChange: (g) => u(g.target.value),
        placeholder: p,
        disabled: r,
        autoFocus: !0
      }
    ),
    c && /* @__PURE__ */ x("span", { className: "fdv2-ac-loading", "aria-hidden": "true", children: "…" }),
    l.length > 0 && /* @__PURE__ */ x("ul", { className: "fdv2-choice-list", children: l.map((g) => /* @__PURE__ */ x("li", { children: /* @__PURE__ */ P("button", { type: "button", disabled: r, onClick: () => t(g), children: [
      g.label,
      g.sublabel ? ` — ${g.sublabel}` : ""
    ] }) }, g.value)) })
  ] });
}
function hp({ control: e, onSelect: t }) {
  const { t: n } = ee(), { loading: r } = we(), [i, s] = ne(e.prefill || "");
  return /* @__PURE__ */ P("div", { className: "fdv2-date-control fdv2-choice-row", children: [
    /* @__PURE__ */ x(
      "input",
      {
        type: "date",
        className: "fdv2-slot-input fdv2-date-input",
        value: i,
        onChange: (a) => s(a.target.value),
        disabled: r
      }
    ),
    /* @__PURE__ */ x(
      "button",
      {
        type: "button",
        className: "fdv2-choice-btn fdv2-choice-confirm",
        disabled: r || !i,
        onClick: () => {
          i && t(i);
        },
        children: n("date.set")
      }
    )
  ] });
}
function dp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = we(), i = e.options || [], [s, o] = ne(() => new Set(e.selected || [])), a = (l) => {
    o((f) => {
      const c = new Set(f);
      return c.has(l) ? c.delete(l) : c.add(l), c;
    });
  }, u = () => {
    const l = i.map((f) => f.value).filter((f) => s.has(f));
    l.length && t(l);
  };
  return /* @__PURE__ */ P("div", { className: "fdv2-multichoice-control", children: [
    /* @__PURE__ */ x("ul", { className: "fdv2-multichoice-list", children: i.map((l) => /* @__PURE__ */ x("li", { className: "fdv2-multichoice-option", children: /* @__PURE__ */ P("label", { children: [
      /* @__PURE__ */ x(
        "input",
        {
          type: "checkbox",
          checked: s.has(l.value),
          disabled: r,
          onChange: () => a(l.value)
        }
      ),
      /* @__PURE__ */ P("span", { children: [
        l.label,
        l.description ? ` — ${l.description}` : ""
      ] })
    ] }) }, l.value)) }),
    /* @__PURE__ */ P("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ x(
        "button",
        {
          type: "button",
          className: "fdv2-choice-btn fdv2-choice-confirm",
          disabled: r || s.size === 0,
          onClick: u,
          children: n("multichoice.confirm")
        }
      ),
      s.size > 0 && /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn", disabled: r, onClick: () => o(/* @__PURE__ */ new Set()), children: n("multichoice.clear") })
    ] })
  ] });
}
function pp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = we(), { type: i, placeholder: s, prefill: o, rows: a } = e, [u, l] = ne(o != null ? String(o) : ""), f = i === "textarea", c = !r && String(u).trim() !== "", d = () => {
    c && t(u);
  }, p = {
    className: "fdv2-slot-input",
    value: u,
    placeholder: s || void 0,
    disabled: r,
    onChange: (g) => l(g.target.value),
    onKeyDown: (g) => {
      g.key === "Enter" && (f && !(g.ctrlKey || g.metaKey) || (g.preventDefault(), d()));
    }
  };
  return /* @__PURE__ */ P("div", { className: `fdv2-freeinput-control fdv2-freeinput-${i}`, children: [
    f ? /* @__PURE__ */ x("textarea", { ...p, rows: a || 4 }) : /* @__PURE__ */ x("input", { ...p, type: i === "number" ? "number" : "text" }),
    /* @__PURE__ */ x("div", { className: "fdv2-choice-row", children: /* @__PURE__ */ x(
      "button",
      {
        type: "button",
        className: "fdv2-choice-btn fdv2-choice-confirm",
        disabled: !c,
        onClick: d,
        children: n("freeInput.submit")
      }
    ) })
  ] });
}
function gp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = we(), i = e.prefill;
  return /* @__PURE__ */ P("div", { className: "fdv2-toggle-control fdv2-choice-row", children: [
    /* @__PURE__ */ x(
      "button",
      {
        type: "button",
        className: `fdv2-choice-btn ${i === !0 ? "fdv2-choice-confirm" : ""}`,
        disabled: r,
        onClick: () => t(!0),
        children: n("toggle.on")
      }
    ),
    /* @__PURE__ */ x(
      "button",
      {
        type: "button",
        className: `fdv2-choice-btn ${i === !1 ? "fdv2-choice-confirm" : ""}`,
        disabled: r,
        onClick: () => t(!1),
        children: n("toggle.off")
      }
    )
  ] });
}
function mp({ control: e, onAccept: t, onEdit: n }) {
  const { t: r } = ee(), { loading: i } = we(), s = e.fields || [];
  return /* @__PURE__ */ P("div", { className: "fdv2-cascade-control", children: [
    /* @__PURE__ */ x("dl", { className: "fdv2-cascade-list", children: s.map((o) => /* @__PURE__ */ P("div", { className: "fdv2-cascade-row", children: [
      /* @__PURE__ */ x("dt", { children: o.label }),
      /* @__PURE__ */ x("dd", { children: o.display })
    ] }, o.slotId)) }),
    /* @__PURE__ */ P("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", disabled: i, onClick: t, children: r("cascade.accept") }),
      /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn", disabled: i, onClick: n, children: r("cascade.edit") })
    ] })
  ] });
}
const yp = ["text", "textarea", "number"], zi = (e) => `${e.label}${e.description ? ` — ${e.description}` : ""}`;
function ji(e, t) {
  return e === "location" ? { code: t.value, name: t.label } : { userId: t.value, name: t.label, ...t.meta && t.meta.email ? { email: t.meta.email } : {} };
}
function ho({ control: e }) {
  const { t } = ee(), { loading: n } = we(), r = Pe(), [i, s] = ne(null), { id: o, type: a, slotId: u, label: l, defaultValue: f, options: c = [], children: d = [], showChildrenOn: h } = e, p = (w, I, R) => r.sendControlAction({ controlId: o, slotId: u, action: w, value: I }, R), g = h === "_search" && d.some((w) => w.type === "autocomplete"), k = i != null && i !== "list" && i === h ? d : [], b = (w) => w.type === "autocomplete" ? /* @__PURE__ */ x(Mi, { control: w, onPick: (I) => p("submit", ji(w.source?.directory, I), I.label) }, w.id) : /* @__PURE__ */ x("div", { className: "fdv2-control-child", children: /* @__PURE__ */ x(ho, { control: w }) }, w.id), S = (w) => {
    if (d.length && h === w.value) {
      s(i === w.value ? null : w.value);
      return;
    }
    p("select", w.value, w.label);
  };
  return /* @__PURE__ */ P("div", { className: "fdv2-control", children: [
    l && a !== "confirm" && a !== "autocomplete" && /* @__PURE__ */ x("div", { className: "fdv2-control-label", children: l }),
    /* @__PURE__ */ P("div", { className: "fdv2-choice-row", children: [
      a === "confirm" && /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", disabled: n, onClick: () => p("confirm", void 0, t("choice.yes")), children: t("choice.yes") }),
      a === "choice" && c.map((w) => /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => S(w), children: zi(w) }, w.value)),
      a === "confirm" && c.length > 0 && /* @__PURE__ */ P("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => s(i === "list" ? null : "list"), children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      a === "confirm" && g && /* @__PURE__ */ x("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => s(i === "_search" ? null : "_search"), children: t("choice.search") })
    ] }),
    a === "confirm" && i === "list" && /* @__PURE__ */ x("ul", { className: "fdv2-choice-list", children: c.map((w) => /* @__PURE__ */ x("li", { children: /* @__PURE__ */ x("button", { type: "button", disabled: n, onClick: () => p("select", w.value, w.label), children: zi(w) }) }, w.value)) }),
    a === "autocomplete" && /* @__PURE__ */ x(Mi, { control: e, onPick: (w) => p("submit", ji(e.source?.directory, w), w.label) }),
    a === "date" && /* @__PURE__ */ x(hp, { control: e, onSelect: (w) => p("date_select", w, w) }),
    a === "multichoice" && /* @__PURE__ */ x(
      dp,
      {
        control: e,
        onCommit: (w) => r.sendControlAction({ controlId: o, slotId: u, action: "multichoice_select", values: w }, w.join(", "))
      }
    ),
    yp.includes(a) && /* @__PURE__ */ x(
      pp,
      {
        control: e,
        onCommit: (w) => p(a === "number" ? "number_input" : "text_input", w, String(w))
      }
    ),
    a === "cascade_confirm" && /* @__PURE__ */ x(
      mp,
      {
        control: e,
        onAccept: () => p("cascade_accept", void 0, t("cascade.accept")),
        onEdit: () => p("cascade_edit", void 0, t("cascade.edit"))
      }
    ),
    a === "toggle" && /* @__PURE__ */ x(gp, { control: e, onCommit: (w) => p("toggle_input", w, t(w ? "toggle.on" : "toggle.off")) }),
    k.map(b)
  ] });
}
function bp({ controls: e }) {
  return !Array.isArray(e) || e.length === 0 ? null : /* @__PURE__ */ x("div", { className: "fdv2-controls", children: e.map((t) => /* @__PURE__ */ x(ho, { control: t }, t.id)) });
}
function xp() {
  return /* @__PURE__ */ P(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ x("path", { d: "M12 20h9" }),
        /* @__PURE__ */ x("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" })
      ]
    }
  );
}
function kp({ review: e, interactive: t = !0 }) {
  const { t: n } = ee(), { loading: r } = we(), i = Pe();
  if (!e || !Array.isArray(e.groups) || e.groups.length === 0) return null;
  const s = (o) => i.sendControlAction({ slotId: o.slotId, action: "edit" }, n("review.editEcho", { field: o.label }));
  return /* @__PURE__ */ x("div", { className: "fdv2-review", role: "table", "aria-label": e.title || n("review.title"), children: e.groups.map((o) => /* @__PURE__ */ P("div", { className: "fdv2-review-group", role: "rowgroup", children: [
    /* @__PURE__ */ x("div", { className: "fdv2-review-section", children: o.label }),
    o.rows.map((a) => /* @__PURE__ */ P("div", { className: "fdv2-review-row", role: "row", children: [
      /* @__PURE__ */ x("span", { className: "fdv2-review-label", role: "cell", children: a.label }),
      /* @__PURE__ */ x("span", { className: "fdv2-review-value", role: "cell", children: String(a.display ?? "") }),
      /* @__PURE__ */ x("span", { className: "fdv2-review-action", role: "cell", children: t && a.editable && /* @__PURE__ */ x(
        "button",
        {
          type: "button",
          className: "fdv2-review-edit",
          disabled: r,
          title: n("review.edit"),
          "aria-label": n("review.editField", { field: a.label }),
          onClick: () => s(a),
          children: /* @__PURE__ */ x(xp, {})
        }
      ) })
    ] }, a.slotId))
  ] }, o.section)) });
}
function wp({ open: e, sources: t, onClose: n }) {
  const { t: r } = ee();
  if (te(() => {
    if (!e) return;
    const s = (o) => {
      o.key === "Escape" && n();
    };
    return document.addEventListener("keydown", s), () => document.removeEventListener("keydown", s);
  }, [e, n]), !e) return null;
  const i = Array.isArray(t) ? t : [];
  return /* @__PURE__ */ x("div", { className: "fdv2-sources-overlay", role: "presentation", onClick: n, children: /* @__PURE__ */ P(
    "div",
    {
      className: "fdv2-sources-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": r("sources.title"),
      onClick: (s) => s.stopPropagation(),
      children: [
        /* @__PURE__ */ P("div", { className: "fdv2-sources-head", children: [
          /* @__PURE__ */ x("h3", { className: "fdv2-sources-title", children: r("sources.title") }),
          /* @__PURE__ */ x(
            "button",
            {
              type: "button",
              className: "fdv2-sources-close",
              "aria-label": r("sources.close"),
              onClick: n,
              children: "×"
            }
          )
        ] }),
        /* @__PURE__ */ x("ul", { className: "fdv2-sources-list", children: i.map((s) => /* @__PURE__ */ P("li", { className: "fdv2-source-item", children: [
          /* @__PURE__ */ P("div", { className: "fdv2-source-row", children: [
            /* @__PURE__ */ x("span", { className: "fdv2-source-name", children: s.title }),
            typeof s.relevance == "number" && /* @__PURE__ */ P(
              "span",
              {
                className: "fdv2-source-badge",
                title: r("sources.relevance"),
                children: [
                  Math.round(s.relevance * 100),
                  "%"
                ]
              }
            )
          ] }),
          s.collection && /* @__PURE__ */ P("div", { className: "fdv2-source-collection", children: [
            r("sources.collection"),
            ": ",
            s.collection
          ] }),
          s.snippet && /* @__PURE__ */ x("p", { className: "fdv2-source-snippet", children: s.snippet })
        ] }, s.id)) })
      ]
    }
  ) });
}
function vp() {
  return /* @__PURE__ */ P(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ x("path", { d: "M5 12h14" }),
        /* @__PURE__ */ x("path", { d: "M13 6l6 6-6 6" })
      ]
    }
  );
}
function Sp({ navigate: e, onNavigate: t }) {
  const { t: n } = ee();
  return !e || !e.path || typeof t != "function" ? null : /* @__PURE__ */ P(
    "button",
    {
      type: "button",
      className: "fdv2-navigate-link",
      onClick: () => t(e),
      "aria-label": n("navigate.goTo", { path: e.path }),
      children: [
        /* @__PURE__ */ x(vp, {}),
        n("navigate.goThere")
      ]
    }
  );
}
function Cp() {
  return /* @__PURE__ */ P(
    "svg",
    {
      width: "14",
      height: "14",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.8",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ x("path", { d: "M4 5a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z" }),
        /* @__PURE__ */ x("path", { d: "M4 19a2 2 0 0 1 2-2h12" })
      ]
    }
  );
}
function Ep(e, t, n) {
  if (!e) return { label: "", full: "" };
  const r = new Date(e), i = r.toLocaleString(n), s = Date.now() - r.getTime();
  return s < 6e4 ? { label: t("time.justNow"), full: i } : s < 36e5 ? { label: t("time.minutesAgo", { count: Math.floor(s / 6e4) }), full: i } : { label: r.toLocaleTimeString(n, { hour: "2-digit", minute: "2-digit" }), full: i };
}
function Ip({ message: e, isLast: t, onNavigate: n }) {
  const { t: r, i18n: i } = ee(), { role: s, content: o, timestamp: a, metadata: u } = e, l = Ep(a, r, i.language), f = t && s === "assistant" && Array.isArray(u?.controls) && u.controls.length > 0, c = !f && t && s === "assistant" && u?.responseType === "confirm_or_choose" && u?.resolveChoices;
  if (s === "system")
    return /* @__PURE__ */ x("div", { className: "fdv2-message fdv2-message-system", children: /* @__PURE__ */ x("span", { className: "fdv2-system-text", children: o }) });
  const d = s === "user", h = u?.executionLog, p = Array.isArray(u?.sources) ? u.sources : [], [g, k] = Me.useState(!1);
  return /* @__PURE__ */ P("div", { className: `fdv2-message ${d ? "fdv2-message-user" : "fdv2-message-assistant"}`, children: [
    !d && /* @__PURE__ */ x("div", { className: "fdv2-avatar", "aria-hidden": "true", children: "◆" }),
    /* @__PURE__ */ P("div", { className: "fdv2-bubble-col", children: [
      /* @__PURE__ */ x("span", { className: "fdv2-sender", children: r(d ? "senderMe" : "agentName") }),
      !d && u?.preamble && /* @__PURE__ */ x("p", { className: "fdv2-preamble", children: u.preamble }),
      /* @__PURE__ */ x("div", { className: "fdv2-bubble", children: d ? /* @__PURE__ */ x("span", { className: "fdv2-user-text", children: o }) : /* @__PURE__ */ x(cp, { children: o }) }),
      !d && u?.review && /* @__PURE__ */ x(kp, { review: u.review, interactive: t }),
      f && /* @__PURE__ */ x(bp, { controls: u.controls }),
      c && /* @__PURE__ */ x(fp, { resolveChoices: u.resolveChoices }),
      !d && u?.navigate && /* @__PURE__ */ x(Sp, { navigate: u.navigate, onNavigate: n }),
      /* @__PURE__ */ P("div", { className: "fdv2-message-meta", children: [
        /* @__PURE__ */ x("time", { dateTime: a, title: l.full, children: l.label }),
        u?.srNumber && /* @__PURE__ */ x("span", { className: "fdv2-sr-chip", children: u.srNumber }),
        Array.isArray(h) && h.length > 0 && /* @__PURE__ */ P("details", { className: "fdv2-exec-log", children: [
          /* @__PURE__ */ x("summary", { children: r("meta.details", { count: h.length }) }),
          /* @__PURE__ */ x("ol", { children: h.map((b, S) => /* @__PURE__ */ x("li", { className: b.status === "error" ? "err" : "", children: b.node }, S)) })
        ] }),
        !d && p.length > 0 && /* @__PURE__ */ P(
          "button",
          {
            type: "button",
            className: "fdv2-sources-btn",
            title: r("sources.view"),
            "aria-label": r("sources.view"),
            onClick: () => k(!0),
            children: [
              /* @__PURE__ */ x(Cp, {}),
              /* @__PURE__ */ x("span", { className: "fdv2-sources-count", children: p.length })
            ]
          }
        )
      ] })
    ] }),
    !d && p.length > 0 && /* @__PURE__ */ x(wp, { open: g, sources: p, onClose: () => k(!1) })
  ] });
}
function Tp({ children: e, emptyState: t, onNavigate: n }) {
  const { t: r } = ee(), i = is(), s = Pe(), o = ae(null), a = ae(null), u = ae(0);
  te(() => {
    const f = o.current;
    if (!f) return;
    const c = i.length > u.current;
    if (u.current = i.length, !c) return;
    const d = f.scrollHeight - f.scrollTop - f.clientHeight < 120, h = i[i.length - 1];
    (d || h?.role === "assistant" || h?.role === "system") && a.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [i]);
  const l = () => {
    window.confirm(r("resetConfirm")) && s.resetSession();
  };
  return /* @__PURE__ */ P("div", { className: "fdv2-messages-wrap", children: [
    /* @__PURE__ */ x("div", { className: "fdv2-messages", ref: o, children: /* @__PURE__ */ P("div", { className: "fdv2-messages-inner", children: [
      i.length === 0 ? (
        // Host-injectable pre-conversation slot; falls back to a bare greeting.
        t != null ? /* @__PURE__ */ x("div", { className: "fdv2-empty fdv2-empty-custom", children: t }) : /* @__PURE__ */ P("div", { className: "fdv2-empty", children: [
          /* @__PURE__ */ x("div", { className: "fdv2-empty-icon", children: "◆" }),
          /* @__PURE__ */ x("h2", { children: r("emptyTitle") })
        ] })
      ) : i.map((f, c) => /* @__PURE__ */ x(Ip, { message: f, isLast: c === i.length - 1, onNavigate: n }, f.id)),
      e,
      /* @__PURE__ */ x("div", { ref: a })
    ] }) }),
    i.length > 0 && /* @__PURE__ */ P(
      "button",
      {
        type: "button",
        className: "fdv2-newchat",
        onClick: l,
        title: r("newChat"),
        "aria-label": r("newChat"),
        children: [
          /* @__PURE__ */ P("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
            /* @__PURE__ */ x("path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }),
            /* @__PURE__ */ x("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })
          ] }),
          /* @__PURE__ */ x("span", { className: "fdv2-newchat-label", children: r("newChat") })
        ]
      }
    )
  ] });
}
const Np = 24e3, Lp = `
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
function Ap(e) {
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
class Rp {
  constructor({ onFrame: t } = {}) {
    this.onFrame = t, this.ctx = null, this.stream = null, this.node = null, this.source = null;
  }
  /** Request the mic and start streaming frames. Throws if permission denied. */
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: !0, noiseSuppression: !0, autoGainControl: !0 }
    });
    const t = window.AudioContext || window.webkitAudioContext;
    this.ctx = new t({ sampleRate: Np }), this.ctx.state === "suspended" && await this.ctx.resume();
    const n = URL.createObjectURL(new Blob([Lp], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(n);
    } finally {
      URL.revokeObjectURL(n);
    }
    this.source = this.ctx.createMediaStreamSource(this.stream), this.node = new AudioWorkletNode(this.ctx, "fdv2-capture"), this.node.port.onmessage = (r) => {
      this.onFrame && this.onFrame(Ap(r.data));
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
const $i = 24e3;
function Op(e) {
  const t = atob(e), n = t.length, r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[i] = t.charCodeAt(i);
  return new Int16Array(r.buffer, 0, n >> 1);
}
function Pp(e) {
  const t = new Float32Array(e.length);
  for (let n = 0; n < e.length; n++) t[n] = Math.max(-1, e[n] / 32768);
  return t;
}
class _p {
  constructor({ onStarted: t, onEnded: n } = {}) {
    this.ctx = null, this.nextStartTime = 0, this.activeSources = /* @__PURE__ */ new Set(), this.playing = !1, this.onStarted = t, this.onEnded = n, this._endTimer = null, this.analyser = null, this._freq = null;
  }
  _ensureCtx() {
    if (!this.ctx) {
      const t = window.AudioContext || window.webkitAudioContext;
      this.ctx = new t({ sampleRate: $i });
    }
    if (!this.analyser)
      try {
        this.analyser = this.ctx.createAnalyser(), this.analyser.fftSize = 256, this.analyser.smoothingTimeConstant = 0.8, this.analyser.connect(this.ctx.destination), this._freq = new Uint8Array(this.analyser.frequencyBinCount);
      } catch {
        this.analyser = null;
      }
    return this.ctx.state === "suspended" && this.ctx.resume(), this.ctx;
  }
  /**
   * Current output amplitude in [0,1] for the pulsing orb (Phase 6). Mean of the
   * frequency magnitudes, normalized; 0 when idle or when no analyser is available.
   */
  getLevel() {
    if (!this.playing || !this.analyser || !this._freq) return 0;
    this.analyser.getByteFrequencyData(this._freq);
    let t = 0;
    for (let n = 0; n < this._freq.length; n++) t += this._freq[n];
    return t / this._freq.length / 255;
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
    const n = this._ensureCtx(), r = Pp(Op(t));
    if (r.length === 0) return;
    const i = n.createBuffer(1, r.length, $i);
    i.getChannelData(0).set(r);
    const s = n.createBufferSource();
    s.buffer = i, s.connect(this.analyser || n.destination);
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
const G = {
  IDLE: "idle",
  CONNECTING: "connecting",
  LISTENING: "listening",
  PROCESSING: "processing",
  SPEAKING: "speaking",
  ERROR: "error"
}, Nn = {
  listening: G.LISTENING,
  processing: G.PROCESSING,
  speaking: G.SPEAKING
}, Dp = 15e3;
class Fp {
  constructor({ sessionId: t, userId: n, lang: r, voice: i, onState: s, onTranscript: o, onChoices: a, onError: u } = {}) {
    this.sessionId = t, this.userId = n || Oe().userId, this.lang = r || null, this.voice = i || null, this.onState = s || (() => {
    }), this.onTranscript = o || (() => {
    }), this.onChoices = a || (() => {
    }), this.onError = u || (() => {
    }), this.ws = null, this.capture = null, this.playback = null, this.state = G.IDLE, this._closed = !1, this._idleTimer = null;
  }
  _setState(t) {
    this.state = t, this.onState(t);
  }
  // V2 idle auto-disable: armed only once the agent's audio has fully drained and
  // we are listening; any activity clears it; on timeout the session ends.
  _armIdle() {
    this._clearIdle(), this._idleTimer = setTimeout(() => {
      this._idleTimer = null, this._closed || this.stop();
    }, Dp);
  }
  _clearIdle() {
    this._idleTimer && (clearTimeout(this._idleTimer), this._idleTimer = null);
  }
  _maybeArmIdleAfterSpeech() {
    this.state === G.LISTENING && (!this.playback || !this.playback.playing) && this._armIdle();
  }
  /** Phase 6: current TTS output amplitude [0,1] for the pulsing orb. */
  getLevel() {
    return this.playback ? this.playback.getLevel() : 0;
  }
  async start() {
    this._setState(G.CONNECTING), this._ensurePlayback();
    try {
      this.playback.unlock();
    } catch {
    }
    try {
      const t = await this._fetchToken(), n = await ze(), r = this._buildWsUrl(t, n);
      await this._openWs(r, t);
    } catch (t) {
      this._fail(t);
    }
  }
  async _fetchToken() {
    const t = await ze({ "Content-Type": "application/json" }), n = await Ge()(Qn("/flowdesk/voice/token"), {
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
    const r = new URL(Oe().apiBaseUrl, window.location.origin), i = r.protocol === "https:" ? "wss:" : "ws:", s = r.pathname.replace(/\/+$/, ""), o = t.proxySuffix || "/flowdesk/voice/proxy", a = new URLSearchParams();
    a.set("sessionId", this.sessionId), a.set("ticket", t.ticket), this.lang && a.set("lang", this.lang), this.voice && a.set("voice", this.voice);
    const u = (c, ...d) => {
      for (const h of d)
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
          await this._startCapture(), this._setState(G.LISTENING);
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
        Nn[t.status] && (this._setState(Nn[t.status]), Nn[t.status] === G.LISTENING ? this._maybeArmIdleAfterSpeech() : this._clearIdle());
        break;
      case "barge_in":
        this._clearIdle(), this.playback && this.playback.clear();
        break;
      case "transcript":
        this._clearIdle(), t.text && this.onTranscript(t.role || "assistant", t.text, { language: t.lang, meta: t.meta || null });
        break;
      case "choices":
        this.onChoices(t.items || []);
        break;
      case "audio":
        t.data && (this._clearIdle(), this._ensurePlayback(), this.playback.enqueue(t.data));
        break;
      case "audioDone":
        break;
      case "error":
        this.onError(new Error(t.message || "voice error"));
        break;
    }
  }
  _ensurePlayback() {
    this.playback || (this.playback = new _p({ onEnded: () => this._maybeArmIdleAfterSpeech() }));
  }
  async _startCapture() {
    this.capture = new Rp({
      onFrame: (t) => {
        this.ws && this.ws.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ type: "audio", data: t }));
      }
    }), await this.capture.start();
  }
  _fail(t) {
    this._setState(G.ERROR), this.onError(t instanceof Error ? t : new Error(String(t))), this._teardown();
  }
  async _teardown() {
    if (!this._closed) {
      this._closed = !0, this._clearIdle();
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
    await this._teardown(), this.state !== G.ERROR && this._setState(G.IDLE);
  }
  /** V2: request a zero-query anchor explanation over the open WS ("Get help"). */
  sendExplain(t) {
    this.ws && this.ws.readyState === WebSocket.OPEN && t && t.id && this.ws.send(JSON.stringify({ type: "explain", anchor: { id: t.id, title: t.title } }));
  }
}
function Mp({ userId: e, lang: t, voice: n } = {}) {
  const [r, i] = ne(G.IDLE), [s, o] = ne(null), [a, u] = ne(0), l = ae(null), f = ae(null), c = Pe(), d = ns((b) => b.session.id);
  te(() => {
    if (!(r !== G.IDLE && r !== G.ERROR)) {
      u(0);
      return;
    }
    let S = !0;
    const w = () => {
      S && (u(l.current ? l.current.getLevel() : 0), f.current = requestAnimationFrame(w));
    };
    return f.current = requestAnimationFrame(w), () => {
      S = !1, f.current && cancelAnimationFrame(f.current);
    };
  }, [r]);
  const h = Ce(async () => {
    const b = l.current;
    l.current = null, b && await b.stop(), i(G.IDLE);
  }, []), p = Ce(async () => {
    if (l.current) return;
    o(null);
    const b = new Fp({
      sessionId: d,
      userId: e || Oe().userId,
      lang: t,
      voice: n,
      onState: i,
      onTranscript: (S, w, I) => {
        const R = { source: "voice" };
        S === "assistant" && I && I.meta && Object.assign(R, I.meta), c.addMessage(S, w, R);
      },
      onError: (S) => {
        o(S), i(G.ERROR), c.addMessage("system", `🎤 ${S.message}`), l.current = null;
      }
    });
    l.current = b, await b.start();
  }, [d, e, t, n, c]), g = Ce(() => l.current ? h() : p(), [p, h]);
  te(() => () => {
    l.current && l.current.stop();
  }, []);
  const k = r !== G.IDLE && r !== G.ERROR;
  return { state: r, error: s, level: a, isActive: k, start: p, stop: h, toggle: g };
}
function zp({ state: e = "idle", amplitude: t = 0, size: n = 72, label: r, className: i = "" }) {
  const s = Math.max(0, Math.min(1, Number(t) || 0)), a = e === "speaking" || e === "listening" ? 1 + s * 0.35 : 1;
  return /* @__PURE__ */ x(
    "div",
    {
      className: `fdv2-voice-orb fdv2-voice-orb--${e}${i ? ` ${i}` : ""}`,
      style: { "--orb-size": `${n}px`, "--orb-scale": a },
      role: "status",
      "aria-label": r || e,
      children: /* @__PURE__ */ x("span", { className: "fdv2-voice-orb-core" })
    }
  );
}
const Bi = {
  en: [
    { id: "en-US-AvaMultilingualNeural", label: "Ava", default: !0 },
    { id: "en-US-JennyNeural", label: "Jenny (US)" },
    { id: "en-US-GuyNeural", label: "Guy (US)" },
    { id: "en-GB-SoniaNeural", label: "Sonia (UK)" }
  ],
  ru: [
    { id: "ru-RU-SvetlanaNeural", label: "Светлана", default: !0 },
    { id: "ru-RU-DmitryNeural", label: "Дмитрий" }
  ],
  fr: [
    { id: "fr-FR-VivienneMultilingualNeural", label: "Vivienne", default: !0 },
    { id: "fr-FR-DeniseNeural", label: "Denise" },
    { id: "fr-FR-HenriNeural", label: "Henri" }
  ],
  es: [
    { id: "es-ES-ElviraNeural", label: "Elvira", default: !0 },
    { id: "es-ES-AlvaroNeural", label: "Álvaro" }
  ],
  ar: [
    { id: "ar-SA-HamedNeural", label: "حامد", default: !0 },
    { id: "ar-SA-ZariyahNeural", label: "زارية" }
  ],
  zh: [
    { id: "zh-CN-XiaoxiaoMultilingualNeural", label: "晓晓", default: !0 },
    { id: "zh-CN-YunxiNeural", label: "云希" }
  ]
}, jp = (e) => String(e || "en").split("-")[0];
function yr(e) {
  return Bi[jp(e)] || Bi.en;
}
function $p(e) {
  const t = yr(e), n = t.find((r) => r.default) || t[0];
  return n ? n.id : null;
}
function Bp(e, t) {
  return !!e && yr(t).some((n) => n.id === e);
}
function po(e, t) {
  const n = t || e && e.language || "en", r = e && e.voice;
  return Bp(r, n) ? r : $p(n);
}
const Vp = {
  [G.CONNECTING]: "thinking",
  [G.LISTENING]: "listening",
  [G.PROCESSING]: "thinking",
  [G.SPEAKING]: "speaking"
};
function Hp({ userId: e }) {
  const { t } = ee(), [n] = Xn(), { state: r, level: i, isActive: s, toggle: o } = Mp({ userId: e, lang: n.language, voice: po(n, n.language) }), a = t("liveChat"), u = r === G.CONNECTING, l = {
    [G.IDLE]: a,
    [G.CONNECTING]: t("liveChatConnecting", "Connecting…"),
    [G.LISTENING]: t("liveChatListening", "Listening…"),
    [G.PROCESSING]: t("liveChatProcessing", "Thinking…"),
    [G.SPEAKING]: t("liveChatSpeaking", "Speaking…"),
    [G.ERROR]: a
  }[r] || a, f = r === G.SPEAKING, c = /* @__PURE__ */ x(
    "button",
    {
      type: "button",
      className: `fdv2-livechat-fab${s ? " is-active" : ""}`,
      "data-voice-state": r,
      style: f ? { "--fdv2-level": i || 0 } : void 0,
      onClick: o,
      "aria-pressed": s,
      title: l,
      "aria-label": l,
      children: u ? (
        // spinner
        /* @__PURE__ */ x("svg", { className: "fdv2-spin", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ x("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }) })
      ) : s ? (
        // active mic (stop) glyph
        /* @__PURE__ */ P("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
          /* @__PURE__ */ x("rect", { x: "9", y: "2", width: "6", height: "12", rx: "3" }),
          /* @__PURE__ */ x("path", { d: "M5 10a7 7 0 0 0 14 0" }),
          /* @__PURE__ */ x("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
        ] })
      ) : (
        // live-chat glyph: speech bubble
        /* @__PURE__ */ x("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: /* @__PURE__ */ x("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" }) })
      )
    }
  ), d = s ? Gn(
    /* @__PURE__ */ x("div", { className: "fdv2-voice-overlay", role: "presentation", onClick: o, children: /* @__PURE__ */ P("div", { className: "fdv2-voice-stage", onClick: (h) => h.stopPropagation(), children: [
      /* @__PURE__ */ x(zp, { state: Vp[r] || "idle", amplitude: i, size: 140, label: l }),
      /* @__PURE__ */ x("div", { className: "fdv2-voice-status", children: l }),
      /* @__PURE__ */ x("button", { type: "button", className: "fdv2-voice-end", onClick: o, children: t("liveChatEnd", "End") })
    ] }) }),
    document.body
  ) : null;
  return /* @__PURE__ */ P(Vi, { children: [
    c,
    d
  ] });
}
function Up({ open: e, onClose: t }) {
  const { t: n } = ee(), [r, i] = Xn(), s = yr(r.language), o = po(r, r.language);
  return te(() => {
    if (!e) return;
    const a = (u) => {
      u.key === "Escape" && t && t();
    };
    return document.addEventListener("keydown", a), () => document.removeEventListener("keydown", a);
  }, [e, t]), e ? Gn(
    /* @__PURE__ */ x("div", { className: "fdv2-settings-overlay", role: "presentation", onClick: t, children: /* @__PURE__ */ P(
      "div",
      {
        className: "fdv2-settings-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "fdv2-settings-title",
        onClick: (a) => a.stopPropagation(),
        children: [
          /* @__PURE__ */ P("header", { className: "fdv2-settings-header", children: [
            /* @__PURE__ */ x("span", { id: "fdv2-settings-title", className: "fdv2-settings-title", children: n("settings.title", "AI Settings") }),
            /* @__PURE__ */ x("button", { type: "button", className: "fdv2-settings-close", onClick: t, "aria-label": n("settings.close", "Close"), children: "×" })
          ] }),
          /* @__PURE__ */ P("div", { className: "fdv2-settings-body", children: [
            /* @__PURE__ */ P("div", { className: "fdv2-setting-group", children: [
              /* @__PURE__ */ x("label", { className: "fdv2-setting-label", htmlFor: "fdv2-setting-language", children: n("settings.language", "Language") }),
              /* @__PURE__ */ x(
                "select",
                {
                  id: "fdv2-setting-language",
                  className: "fdv2-setting-select",
                  value: r.language,
                  onChange: (a) => i({ language: a.target.value, voice: null }),
                  children: Jn.map((a) => /* @__PURE__ */ x("option", { value: a.code, children: a.label }, a.code))
                }
              ),
              /* @__PURE__ */ x("p", { className: "fdv2-setting-hint", children: n("settings.languageHint", "Used for AI responses and for voice/text recognition. Auto-detection is off.") })
            ] }),
            /* @__PURE__ */ P("div", { className: "fdv2-setting-group", children: [
              /* @__PURE__ */ x("label", { className: "fdv2-setting-label", htmlFor: "fdv2-setting-voice", children: n("settings.voice", "Assistant voice") }),
              /* @__PURE__ */ x(
                "select",
                {
                  id: "fdv2-setting-voice",
                  className: "fdv2-setting-select",
                  value: o || "",
                  onChange: (a) => i({ voice: a.target.value }),
                  children: s.map((a) => /* @__PURE__ */ P("option", { value: a.id, children: [
                    a.label,
                    a.default ? ` · ${n("settings.voiceDefault", "Default")}` : ""
                  ] }, a.id))
                }
              ),
              /* @__PURE__ */ x("p", { className: "fdv2-setting-hint", children: n("settings.voiceHint", "Voice used for the AI assistant’s spoken replies.") })
            ] })
          ] })
        ]
      }
    ) }),
    document.body
  ) : null;
}
const qp = 8;
function Kp({ userId: e, showVoiceControls: t = !0, showSettings: n = !0 }) {
  const { t: r } = ee(), { loading: i, composerDisabled: s } = we(), o = Pe(), [a, u] = ne(""), [l, f] = ne(!1), c = ae(null), d = ae(null), h = Ce(() => {
    const S = c.current;
    if (!S) return;
    S.style.height = "auto";
    const I = (parseFloat(getComputedStyle(S).lineHeight) || 20) * qp;
    S.style.height = `${Math.min(S.scrollHeight, I)}px`, S.style.overflowY = S.scrollHeight > I ? "auto" : "hidden";
  }, []);
  te(() => {
    h();
  }, [a, h]), te(() => {
    !i && !s && c.current?.focus();
  }, [i, s]);
  const p = a.trim().length > 0 && !i && !s, g = Ce(async () => {
    const S = a.trim();
    if (!S || i || s) return;
    u("");
    const w = new AbortController();
    d.current = w;
    try {
      await o.sendMessage(S, e, w.signal);
    } finally {
      d.current = null, c.current?.focus();
    }
  }, [a, i, s, o, e]), k = Ce(() => {
    d.current?.abort();
  }, []);
  return /* @__PURE__ */ P("div", { className: "fdv2-composer-wrap", children: [
    /* @__PURE__ */ P("div", { className: `fdv2-composer ${s ? "is-disabled" : ""}`, children: [
      /* @__PURE__ */ x(
        "textarea",
        {
          ref: c,
          className: "fdv2-textarea",
          rows: 1,
          value: a,
          onChange: (S) => u(S.target.value),
          onKeyDown: (S) => {
            S.key === "Enter" && !S.shiftKey && (S.preventDefault(), g());
          },
          placeholder: r(s ? "composerDisabled" : "composerPlaceholder"),
          disabled: s,
          "aria-label": r("composerPlaceholder")
        }
      ),
      i ? /* @__PURE__ */ x("button", { type: "button", className: "fdv2-icon-btn fdv2-stop", onClick: k, title: r("stop"), "aria-label": r("stop"), children: /* @__PURE__ */ x("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ x("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) }) }) : /* @__PURE__ */ x("button", { type: "button", className: "fdv2-icon-btn fdv2-send", onClick: g, disabled: !p, title: r("send"), "aria-label": r("send"), children: /* @__PURE__ */ P("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
        /* @__PURE__ */ x("line", { x1: "12", y1: "19", x2: "12", y2: "5" }),
        /* @__PURE__ */ x("polyline", { points: "5 12 12 5 19 12" })
      ] }) }),
      (n || t) && /* @__PURE__ */ P("div", { className: "fdv2-composer-tools", children: [
        t && /* @__PURE__ */ x(Hp, { userId: e }),
        n && /* @__PURE__ */ x(
          "button",
          {
            type: "button",
            className: "fdv2-icon-btn fdv2-settings-btn",
            onClick: () => f(!0),
            title: r("settings.open", "AI Settings"),
            "aria-label": r("settings.open", "AI Settings"),
            "aria-haspopup": "dialog",
            children: /* @__PURE__ */ P("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
              /* @__PURE__ */ x("circle", { cx: "12", cy: "12", r: "3" }),
              /* @__PURE__ */ x("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })
            ] })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ x("div", { className: "fdv2-composer-hint", children: r("composerHint") }),
    /* @__PURE__ */ x(Up, { open: l, onClose: () => f(!1) })
  ] });
}
function Wp() {
  const { t: e } = ee(), { loading: t, currentNode: n } = we();
  if (!t) return null;
  const r = n && e(`node.${n}`, { defaultValue: "" }) || e("thinking");
  return /* @__PURE__ */ P("div", { className: "fdv2-message fdv2-message-assistant fdv2-typing", "aria-live": "polite", children: [
    /* @__PURE__ */ x("div", { className: "fdv2-avatar", "aria-hidden": "true", children: "◆" }),
    /* @__PURE__ */ x("div", { className: "fdv2-bubble-col", children: /* @__PURE__ */ P("div", { className: "fdv2-typing-row", children: [
      /* @__PURE__ */ P("span", { className: "fdv2-typing-dots", "aria-hidden": "true", children: [
        /* @__PURE__ */ x("i", {}),
        /* @__PURE__ */ x("i", {}),
        /* @__PURE__ */ x("i", {})
      ] }),
      /* @__PURE__ */ x("span", { className: "fdv2-typing-text", children: r })
    ] }) })
  ] });
}
const Gp = {
  extracted: "🤖",
  user_edited: "✏️",
  context: "📍",
  resolved: "⚙️"
};
function go(e, t, n, r = /* @__PURE__ */ new Set()) {
  return r.has(e) ? !1 : (r.add(e), t?.[e]?.stale ? !0 : ((n?.slots || []).find((a) => a.slotId === e)?.dependsOn || []).some((a) => go(a, t, n, r)));
}
function Jp(e) {
  return (e?.phases || []).map((r) => ({
    phase: r,
    slots: (e?.slots || []).filter((i) => i.phase === r)
  })).filter((r) => r.slots.length > 0);
}
function Yp(e) {
  return e == null || e === "" ? null : typeof e == "object" ? e.name || e.city || e.id || e.mode || JSON.stringify(e) : String(e);
}
function Qp({ slotDef: e, slotValue: t, affectedStale: n, onEdit: r }) {
  const { t: i } = ee(), [s, o] = ne(!1), [a, u] = ne(""), l = ae(null), f = Yp(t?.value), c = t?.provenance || null, d = c ? Gp[c] : null, h = c ? i(`provenance.${c}`, { defaultValue: c }) : "", p = e.type === "enum", k = !(t && typeof t.value == "object");
  te(() => {
    s && l.current?.focus();
  }, [s]);
  const b = () => {
    k && (u(p ? t?.value ?? "" : f ?? ""), o(!0));
  }, S = () => {
    o(!1);
    const I = a;
    I !== "" && I !== (t?.value ?? "") && r(e.slotId, I);
  }, w = (I) => {
    I.key === "Enter" && (I.preventDefault(), S()), I.key === "Escape" && o(!1);
  };
  return /* @__PURE__ */ P("div", { className: `fdv2-slot ${n ? "is-stale" : ""}`, children: [
    /* @__PURE__ */ P("div", { className: "fdv2-slot-label", children: [
      (e.promptHint, e.slotId),
      e.required && /* @__PURE__ */ x("span", { className: "fdv2-slot-req", title: i("slot.required"), children: "*" })
    ] }),
    /* @__PURE__ */ P("div", { className: "fdv2-slot-value", children: [
      s ? p ? /* @__PURE__ */ P("select", { ref: l, value: a, onChange: (I) => u(I.target.value), onBlur: S, onKeyDown: w, className: "fdv2-slot-input", children: [
        /* @__PURE__ */ x("option", { value: "", disabled: !0, children: "—" }),
        (e.presentOptions || []).map((I) => /* @__PURE__ */ x("option", { value: I.value, children: I.label }, I.value))
      ] }) : /* @__PURE__ */ x("input", { ref: l, value: a, onChange: (I) => u(I.target.value), onBlur: S, onKeyDown: w, className: "fdv2-slot-input" }) : /* @__PURE__ */ x("button", { type: "button", className: `fdv2-slot-val-btn ${f ? "" : "is-empty"} ${k ? "" : "is-readonly"}`, onClick: b, title: k ? i("slot.edit") : "", children: f || "—" }),
      d && /* @__PURE__ */ x("span", { className: "fdv2-slot-prov", title: h, "aria-label": h, children: d }),
      n && /* @__PURE__ */ x("span", { className: "fdv2-slot-stale", title: i("slot.stale"), children: "⚠️" })
    ] })
  ] });
}
function Xp() {
  const { t: e } = ee(), t = Da(), n = Fa(), r = ss(), { draftPanelOpen: i } = we(), s = Pe(), o = !!r.serviceId;
  if (!i)
    return /* @__PURE__ */ x("div", { className: "fdv2-draft-collapsed", children: /* @__PURE__ */ x("button", { type: "button", className: "fdv2-icon-btn", onClick: s.toggleDraftPanel, title: e("draft.expand"), "aria-label": e("draft.expand"), children: "▸" }) });
  const a = n?.metadata?.title || r.serviceId || e("draft.title"), u = e(`status.${r.status || "draft"}`, { defaultValue: r.status || "" }), l = n ? Jp(n) : [], f = t.beneficiary;
  return /* @__PURE__ */ P("div", { className: "fdv2-draft-panel", children: [
    /* @__PURE__ */ P("div", { className: "fdv2-draft-head", children: [
      /* @__PURE__ */ x("div", { className: "fdv2-draft-title", children: a }),
      /* @__PURE__ */ P("div", { className: "fdv2-draft-headright", children: [
        /* @__PURE__ */ x("span", { className: `fdv2-status-badge fdv2-status-${r.status || "draft"}`, children: u }),
        /* @__PURE__ */ x("button", { type: "button", className: "fdv2-icon-btn fdv2-draft-collapse", onClick: s.toggleDraftPanel, title: e("draft.collapse"), "aria-label": e("draft.collapse"), children: "▾" })
      ] })
    ] }),
    o ? /* @__PURE__ */ P("div", { className: "fdv2-draft-body", children: [
      f && /* @__PURE__ */ P("div", { className: "fdv2-draft-benef", children: [
        /* @__PURE__ */ x("span", { className: "fdv2-benef-label", children: e("draft.beneficiary") }),
        /* @__PURE__ */ x("span", { className: "fdv2-benef-val", children: f.mode === "self" ? e("draft.forSelf") : f.resolvedProfile?.name || f.userId || "—" })
      ] }),
      l.length === 0 && /* @__PURE__ */ x("div", { className: "fdv2-draft-empty", children: /* @__PURE__ */ x("p", { children: e("draft.loading") }) }),
      l.map((c) => /* @__PURE__ */ P("section", { className: "fdv2-draft-group", children: [
        /* @__PURE__ */ x("h4", { className: "fdv2-draft-group-title", children: e(`phase.${c.phase}`, { defaultValue: c.phase }) }),
        c.slots.map((d) => /* @__PURE__ */ x(
          Qp,
          {
            slotDef: d,
            slotValue: t.slots[d.slotId],
            affectedStale: go(d.slotId, t.slots, n),
            onEdit: s.patchSlot
          },
          d.slotId
        ))
      ] }, c.phase))
    ] }) : /* @__PURE__ */ P("div", { className: "fdv2-draft-empty", children: [
      /* @__PURE__ */ x("p", { children: e("draft.empty") }),
      /* @__PURE__ */ x("p", { className: "fdv2-draft-empty-hint", children: e("draft.emptyHint") })
    ] })
  ] });
}
function Zp({
  showDraftPanel: e,
  showLanguageSwitcher: t,
  showVoiceControls: n,
  className: r,
  serviceId: i,
  sessionId: s = null,
  emptyState: o,
  userProfile: a,
  anchorContext: u = null,
  compact: l = !1,
  onNavigate: f
}) {
  const { t: c } = ee(), d = Pe(), h = ss(), p = Je(), [g, k] = ne($r()), b = ae(!1);
  te(() => {
    b.current || !s || (b.current = !0, d.adoptSession(s), d.loadVoiceHistory && d.loadVoiceHistory());
  }, [s, d]), te(() => {
    const I = () => k($r());
    return ke.on("languageChanged", I), () => ke.off("languageChanged", I);
  }, []);
  const S = ae(!1);
  te(() => {
    d.setAnchorContext && d.setAnchorContext(u || null), u && u.anchorId && !S.current && (S.current = !0, d.sendAnchorExplain(u));
  }, [u, d]), te(() => {
    a && a.userId && d.setUser(a);
  }, [a, d]);
  const w = ae(!1);
  return te(() => {
    w.current || !i || (w.current = !0, h.serviceId !== i && (p.getState().messages.length > 0 || d.startSession(i)));
  }, [i, h.serviceId, d]), /* @__PURE__ */ x(
    "div",
    {
      className: `fdv2-root${l ? " fdv2-compact" : ""}${r ? ` ${r}` : ""}`,
      "data-feature": "altiora-chat",
      dir: g,
      children: /* @__PURE__ */ P("main", { className: "fdv2-main", children: [
        /* @__PURE__ */ P("section", { className: "fdv2-conversation", "aria-label": "Conversation", children: [
          /* @__PURE__ */ x(Tp, { emptyState: o, onNavigate: f, children: /* @__PURE__ */ x(Wp, {}) }),
          /* @__PURE__ */ x(Kp, { showVoiceControls: n, showSettings: t })
        ] }),
        e && /* @__PURE__ */ x("aside", { className: "fdv2-draft", "aria-label": c("draft.requestLabel"), children: /* @__PURE__ */ x(Xp, {}) })
      ] })
    }
  );
}
function eg({
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
  emptyState: d,
  children: h,
  onSubmitted: p,
  onError: g,
  onSessionStart: k,
  anchorContext: b = null,
  compact: S = !1,
  // eslint-disable-next-line no-unused-vars -- Phase 3: host close handler, consumed by the floating window wrapper
  onClose: w,
  onNavigate: I,
  onOpenForm: R,
  storeId: C = "default",
  sessionId: z = null
}) {
  const V = ae(null), _ = is(), v = Pe();
  te(() => {
    if (!R || !Array.isArray(_) || !_.length) return;
    const L = [..._].reverse().find((F) => F.metadata && F.metadata.openForm);
    !L || V.current === L.id || (V.current = L.id, R(L.metadata.openForm), v.completeWithThanks(L.metadata?.srNumber || null));
  }, [_, R, v]), Ca({
    apiBaseUrl: e,
    userId: t,
    getAuthHeaders: r,
    fetchImpl: i,
    eventSourceImpl: s,
    onSubmitted: p,
    onError: g,
    onSessionStart: k
  });
  const [N] = Xn();
  return te(() => {
    o && !Ma() && os({ language: o });
  }, [o]), te(() => {
    ga(N.language);
  }, [N.language]), /* @__PURE__ */ x(Qi, { i18n: ke, children: /* @__PURE__ */ x(_a, { storeId: C, children: /* @__PURE__ */ x(
    Zp,
    {
      showDraftPanel: u,
      showLanguageSwitcher: l,
      showVoiceControls: f,
      className: c,
      serviceId: a,
      sessionId: z,
      emptyState: d ?? h,
      userProfile: n,
      anchorContext: b,
      compact: S,
      onNavigate: I
    }
  ) }) });
}
const mo = Kn({
  isOpen: !1,
  anchorContext: null,
  openChat: () => {
  },
  closeChat: () => {
  }
});
function ag({ children: e, storeId: t = "default" }) {
  const [n, r] = ne(!1), [i, s] = ne(null), o = Ce((u = null) => {
    s(u || null), r(!0);
  }, []), a = Ce(() => {
    r(!1);
  }, []);
  return te(() => {
    const u = (f) => o(f && f.detail ? f.detail : null), l = () => a();
    return window.addEventListener("openAltioraChat", u), window.addEventListener("closeAltioraChat", l), () => {
      window.removeEventListener("openAltioraChat", u), window.removeEventListener("closeAltioraChat", l);
    };
  }, [o, a]), /* @__PURE__ */ x(mo.Provider, { value: { isOpen: n, anchorContext: i, openChat: o, closeChat: a, storeId: t }, children: e });
}
const tg = () => Wn(mo);
function ng({ anchorContext: e, closeChat: t, chatProps: n, storeId: r }) {
  const { t: i } = ee();
  te(() => {
    const o = (a) => {
      a.key === "Escape" && t();
    };
    return document.addEventListener("keydown", o), () => document.removeEventListener("keydown", o);
  }, [t]);
  const s = e && e.anchorTitle || i("floatingChat.defaultTitle");
  return /* @__PURE__ */ x("div", { className: "fdv2-floating-overlay", children: /* @__PURE__ */ P("div", { className: "fdv2-floating-window", role: "dialog", "aria-modal": "true", "aria-label": s, children: [
    /* @__PURE__ */ P("header", { className: "fdv2-floating-header", children: [
      /* @__PURE__ */ x("span", { className: "fdv2-floating-title", children: s }),
      /* @__PURE__ */ x(
        "button",
        {
          type: "button",
          className: "fdv2-floating-close",
          "aria-label": i("floatingChat.close"),
          onClick: t,
          children: "×"
        }
      )
    ] }),
    /* @__PURE__ */ x("div", { className: "fdv2-floating-body", children: /* @__PURE__ */ x(eg, { ...n, storeId: r, anchorContext: e, compact: !0, onClose: t }) })
  ] }) });
}
function lg({ chatProps: e }) {
  const { isOpen: t, anchorContext: n, closeChat: r, storeId: i } = tg();
  return t ? Gn(
    /* @__PURE__ */ x(Qi, { i18n: ke, children: /* @__PURE__ */ x(ng, { anchorContext: n, closeChat: r, chatProps: e || {}, storeId: i }) }),
    document.body
  ) : null;
}
function yo(e, t) {
  window.dispatchEvent(new CustomEvent("altioraVoiceExplain", { detail: { anchorId: e, anchorTitle: t } }));
}
function ug({ anchorId: e, anchorTitle: t, className: n = "" }) {
  const { t: r } = ee();
  if (!e) return null;
  const i = t || e;
  return /* @__PURE__ */ x(
    "button",
    {
      type: "button",
      className: `fdv2-explain-trigger${n ? ` ${n}` : ""}`,
      onClick: (s) => {
        s.stopPropagation(), yo(e, i);
      },
      "aria-label": r("explain.trigger", { title: i }),
      title: r("explain.triggerTooltip"),
      children: "?"
    }
  );
}
function cg(e) {
  const { t } = ee();
  te(() => {
    const n = e && e.current || document.body, r = (o) => {
      const a = o.getAttribute("data-kb-anchor");
      if (!a || o.querySelector(":scope > .fdv2-explain-trigger")) return;
      const u = o.getAttribute("data-kb-title") || a;
      window.getComputedStyle(o).position === "static" && (o.style.position = "relative");
      const l = document.createElement("button");
      l.type = "button", l.className = "fdv2-explain-trigger", l.textContent = "?", l.setAttribute("aria-label", t("explain.trigger", { title: u })), l.title = t("explain.triggerTooltip"), l.addEventListener("click", (f) => {
        f.stopPropagation(), yo(a, u);
      }), o.appendChild(l);
    }, i = () => {
      n.matches && n.matches("[data-kb-anchor]") && r(n), n.querySelectorAll("[data-kb-anchor]").forEach(r);
    };
    i();
    const s = new MutationObserver(i);
    return s.observe(n, { childList: !0, subtree: !0 }), () => {
      s.disconnect(), n.querySelectorAll(".fdv2-explain-trigger").forEach((o) => o.remove());
    };
  }, [e, t]);
}
export {
  Up as AISettingsDialog,
  _n as AI_PREFS_EVENT,
  Gt as AI_PREFS_KEY,
  eg as AltioraChat,
  Q as ChatError,
  _a as ChatStoreProvider,
  un as DEFAULT_AI_PREFS,
  ug as ExplainTrigger,
  ag as FloatingChatProvider,
  lg as FloatingChatWindow,
  Jn as LANGUAGES,
  og as SSE_EVENTS,
  Bi as VOICE_OPTIONS,
  Se as chatClient,
  Ca as configureChat,
  $r as currentDir,
  nt as currentLang,
  eg as default,
  pa as dirFor,
  po as effectiveVoice,
  zt as getAIPrefs,
  ts as getChatStore,
  Oe as getConfig,
  $p as getDefaultVoice,
  yr as getVoicesForLanguage,
  Ma as hasStoredAIPrefs,
  ke as i18n,
  Bp as isValidVoice,
  os as setAIPrefs,
  ga as setLang,
  Xn as useAIPrefs,
  Je as useActiveStore,
  Pe as useChatActions,
  ns as useChatStore,
  Da as useDraft,
  tg as useFloatingChat,
  cg as useKBAnchors,
  is as useMessages,
  Fa as useSchema,
  ss as useSession,
  we as useUI
};
//# sourceMappingURL=flowdesk-chat-v2.js.map
