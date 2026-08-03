import { jsxs as N, jsx as g, Fragment as Gn } from "react/jsx-runtime";
import Me, { createContext as Jn, useContext as Yn, useMemo as xt, useRef as oe, useCallback as Ee, useState as re, useEffect as ne, createElement as Ui } from "react";
import { createPortal as qi } from "react-dom";
const $ = (e) => typeof e == "string", dt = () => {
  let e, t;
  const n = new Promise((r, i) => {
    e = r, t = i;
  });
  return n.resolve = e, n.reject = t, n;
}, Er = (e) => e == null ? "" : String(e), Lo = (e, t, n) => {
  e.forEach((r) => {
    t[r] && (n[r] = t[r]);
  });
}, Ao = /###/g, Ir = (e) => e && e.includes("###") ? e.replace(Ao, ".") : e, Nr = (e) => !e || $(e), kt = (e, t, n) => {
  const r = $(t) ? t.split(".") : t;
  let i = 0;
  for (; i < r.length - 1; ) {
    if (Nr(e)) return {};
    const s = Ir(r[i]);
    !e[s] && n && (e[s] = new n()), Object.prototype.hasOwnProperty.call(e, s) ? e = e[s] : e = {}, ++i;
  }
  return Nr(e) ? {} : {
    obj: e,
    k: Ir(r[i])
  };
}, Tr = (e, t, n) => {
  const {
    obj: r,
    k: i
  } = kt(e, t, Object);
  if (r !== void 0 || t.length === 1) {
    r[i] = n;
    return;
  }
  let s = t[t.length - 1], o = t.slice(0, t.length - 1), a = kt(e, o, Object);
  for (; a.obj === void 0 && o.length; )
    s = `${o[o.length - 1]}.${s}`, o = o.slice(0, o.length - 1), a = kt(e, o, Object), a?.obj && typeof a.obj[`${a.k}.${s}`] < "u" && (a.obj = void 0);
  a.obj[`${a.k}.${s}`] = n;
}, Ro = (e, t, n, r) => {
  const {
    obj: i,
    k: s
  } = kt(e, t, Object);
  i[s] = i[s] || [], i[s].push(n);
}, Vt = (e, t) => {
  const {
    obj: n,
    k: r
  } = kt(e, t);
  if (n && Object.prototype.hasOwnProperty.call(n, r))
    return n[r];
}, Oo = (e, t, n) => {
  const r = Vt(e, n);
  return r !== void 0 ? r : Vt(t, n);
}, Ki = (e, t, n) => {
  for (const r in t)
    r !== "__proto__" && r !== "constructor" && (Object.prototype.hasOwnProperty.call(e, r) ? $(e[r]) || e[r] instanceof String || $(t[r]) || t[r] instanceof String ? n && (e[r] = t[r]) : Ki(e[r], t[r], n) : e[r] = t[r]);
  return e;
}, Oe = (e) => e.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), Po = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;"
}, Do = (e) => $(e) ? e.replace(/[&<>"'\/]/g, (t) => Po[t]) : e;
class _o {
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
const Fo = [" ", ",", "?", "!", ";"], Mo = new _o(20), zo = (e, t, n) => {
  t = t || "", n = n || "";
  const r = Fo.filter((o) => !t.includes(o) && !n.includes(o));
  if (r.length === 0) return !0;
  const i = Mo.getRegExp(`(${r.map((o) => o === "?" ? "\\?" : o).join("|")})`);
  let s = !i.test(e);
  if (!s) {
    const o = e.indexOf(n);
    o > 0 && !i.test(e.substring(0, o)) && (s = !0);
  }
  return s;
}, Rn = (e, t, n = ".") => {
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
}, Et = (e) => e?.replace(/_/g, "-"), jo = {
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
class Ht {
  constructor(t, n = {}) {
    this.init(t, n);
  }
  init(t, n = {}) {
    this.prefix = n.prefix || "i18next:", this.logger = t || jo, this.options = n, this.debug = n.debug;
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
    return i && !this.debug ? null : (t = t.map((s) => $(s) ? s.replace(/[\r\n\x00-\x1F\x7F]/g, " ") : s), $(t[0]) && (t[0] = `${r}${this.prefix} ${t[0]}`), this.logger[n](t));
  }
  create(t) {
    return new Ht(this.logger, {
      prefix: `${this.prefix}:${t}:`,
      ...this.options
    });
  }
  clone(t) {
    return t = t || this.options, t.prefix = t.prefix || this.prefix, new Ht(this.logger, t);
  }
}
var Te = new Ht();
class Jt {
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
class Lr extends Jt {
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
    t.includes(".") ? a = t.split(".") : (a = [t, n], r && (Array.isArray(r) ? a.push(...r) : $(r) && s ? a.push(...r.split(s)) : a.push(r)));
    const u = Vt(this.data, a);
    return !u && !n && !r && t.includes(".") && (t = a[0], n = a[1], r = a.slice(2).join(".")), u || !o || !$(r) ? u : Rn(this.data?.[t]?.[n], r, s);
  }
  addResource(t, n, r, i, s = {
    silent: !1
  }) {
    const o = s.keySeparator !== void 0 ? s.keySeparator : this.options.keySeparator;
    let a = [t, n];
    r && (a = a.concat(o ? r.split(o) : r)), t.includes(".") && (a = t.split("."), i = n, n = a[1]), this.addNamespaces(n), Tr(this.data, a, i), s.silent || this.emit("added", t, n, r, i);
  }
  addResources(t, n, r, i = {
    silent: !1
  }) {
    for (const s in r)
      ($(r[s]) || Array.isArray(r[s])) && this.addResource(t, n, s, r[s], {
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
    let u = Vt(this.data, a) || {};
    o.skipCopy || (r = JSON.parse(JSON.stringify(r))), i ? Ki(u, r, s) : u = {
      ...u,
      ...r
    }, Tr(this.data, a, u), o.silent || this.emit("added", t, n, r);
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
var Wi = {
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
const Gi = /* @__PURE__ */ Symbol("i18next/PATH_KEY");
function $o() {
  const e = [], t = /* @__PURE__ */ Object.create(null);
  let n;
  return t.get = (r, i) => (n?.revoke?.(), i === Gi ? e : (e.push(i), n = Proxy.revocable(r, t), n.proxy)), Proxy.revocable(/* @__PURE__ */ Object.create(null), t).proxy;
}
function it(e, t) {
  const {
    [Gi]: n
  } = e($o()), r = t?.keySeparator ?? ".", i = t?.nsSeparator ?? ":", s = t?.enableSelector === "strict";
  if (n.length > 1 && i) {
    const o = t?.ns, a = s ? Array.isArray(o) ? o : o ? [o] : null : Array.isArray(o) ? o : null;
    if (a && (s ? a : a.length > 1 ? a.slice(1) : []).includes(n[0]))
      return `${n[0]}${i}${n.slice(1).join(r)}`;
  }
  return n.join(r);
}
const nn = (e) => !$(e) && typeof e != "boolean" && typeof e != "number";
class Ut extends Jt {
  constructor(t, n = {}) {
    super(), Lo(["resourceStore", "languageUtils", "pluralResolver", "interpolator", "backendConnector", "i18nFormat", "utils"], t, this), this.options = n, this.options.keySeparator === void 0 && (this.options.keySeparator = "."), this.logger = Te.create("translator"), this.checkedLoadedFor = {};
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
    const s = nn(i.res);
    return !(r.returnObjects === !1 && s);
  }
  extractFromKey(t, n) {
    let r = n.nsSeparator !== void 0 ? n.nsSeparator : this.options.nsSeparator;
    r === void 0 && (r = ":");
    const i = n.keySeparator !== void 0 ? n.keySeparator : this.options.keySeparator;
    let s = n.ns || this.options.defaultNS || [];
    const o = r && t.includes(r), a = !this.options.userDefinedKeySeparator && !n.keySeparator && !this.options.userDefinedNsSeparator && !n.nsSeparator && !zo(t, r, i);
    if (o && !a) {
      const u = t.match(this.interpolator.nestingRegexp);
      if (u && u.length > 0)
        return {
          key: t,
          namespaces: $(s) ? [s] : s
        };
      const l = t.split(r);
      (r !== i || r === i && this.options.ns.includes(l[0])) && (s = l.shift()), t = l.join(i);
    }
    return {
      key: t,
      namespaces: $(s) ? [s] : s
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
    })), Array.isArray(t) || (t = [String(t)]), t = t.map((M) => typeof M == "function" ? it(M, {
      ...this.options,
      ...i
    }) : String(M));
    const s = i.returnDetails !== void 0 ? i.returnDetails : this.options.returnDetails, o = i.keySeparator !== void 0 ? i.keySeparator : this.options.keySeparator, {
      key: a,
      namespaces: u
    } = this.extractFromKey(t[t.length - 1], i), l = u[u.length - 1];
    let c = i.nsSeparator !== void 0 ? i.nsSeparator : this.options.nsSeparator;
    c === void 0 && (c = ":");
    const f = i.lng || this.language, h = i.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode;
    if (f?.toLowerCase() === "cimode")
      return h ? s ? {
        res: `${l}${c}${a}`,
        usedKey: a,
        exactUsedKey: a,
        usedLng: f,
        usedNS: l,
        usedParams: this.getUsedParamsDetails(i)
      } : `${l}${c}${a}` : s ? {
        res: a,
        usedKey: a,
        exactUsedKey: a,
        usedLng: f,
        usedNS: l,
        usedParams: this.getUsedParamsDetails(i)
      } : a;
    const d = this.resolve(t, i);
    let p = d?.res;
    const m = d?.usedKey || a, v = d?.exactUsedKey || a, k = ["[object Number]", "[object Function]", "[object RegExp]"], C = i.joinArrays !== void 0 ? i.joinArrays : this.options.joinArrays, S = !this.i18nFormat || this.i18nFormat.handleAsObject, E = i.count !== void 0 && !$(i.count), L = Ut.hasDefaultValue(i), x = E ? this.pluralResolver.getSuffix(f, i.count, i) : "", R = i.ordinal && E ? this.pluralResolver.getSuffix(f, i.count, {
      ordinal: !1
    }) : "", j = E && !i.ordinal && i.count === 0, F = j && i[`defaultValue${this.options.pluralSeparator}zero`] || i[`defaultValue${x}`] || i[`defaultValue${R}`] || i.defaultValue;
    let w = p;
    S && !p && L && (w = F);
    const A = nn(w), D = Object.prototype.toString.apply(w);
    if (S && w && A && !k.includes(D) && !($(C) && Array.isArray(w))) {
      if (!i.returnObjects && !this.options.returnObjects) {
        this.options.returnedObjectHandler || this.logger.warn("accessing an object - but returnObjects options is not enabled!");
        const M = this.options.returnedObjectHandler ? this.options.returnedObjectHandler(m, w, {
          ...i,
          ns: u
        }) : `key '${a} (${this.language})' returned an object instead of string.`;
        return s ? (d.res = M, d.usedParams = this.getUsedParamsDetails(i), d) : M;
      }
      if (o) {
        const M = Array.isArray(w), _ = M ? [] : {}, O = M ? v : m;
        for (const V in w)
          if (Object.prototype.hasOwnProperty.call(w, V)) {
            const W = `${O}${o}${V}`;
            L && !p ? _[V] = this.translate(W, {
              ...i,
              defaultValue: nn(F) ? F[V] : void 0,
              joinArrays: !1,
              ns: u
            }) : _[V] = this.translate(W, {
              ...i,
              joinArrays: !1,
              ns: u
            }), _[V] === W && (_[V] = w[V]);
          }
        p = _;
      }
    } else if (S && $(C) && Array.isArray(p))
      p = p.join(C), p && (p = this.extendTranslation(p, t, i, r));
    else {
      let M = !1, _ = !1;
      !this.isValidLookup(p) && L && (M = !0, p = F), this.isValidLookup(p) || (_ = !0, p = a);
      const V = (i.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey) && _ ? void 0 : p, W = L && F !== p && this.options.updateMissing;
      if (_ || M || W) {
        if (this.logger.log(W ? "updateKey" : "missingKey", f, l, E && !W ? `${a}${this.pluralResolver.getSuffix(f, i.count, i)}` : a, W ? F : p), o) {
          const Z = this.resolve(a, {
            ...i,
            keySeparator: !1
          });
          Z && Z.res && this.logger.warn("Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.");
        }
        let te = [];
        const se = this.languageUtils.getFallbackCodes(this.options.fallbackLng, i.lng || this.language);
        if (this.options.saveMissingTo === "fallback" && se && se[0])
          for (let Z = 0; Z < se.length; Z++)
            te.push(se[Z]);
        else this.options.saveMissingTo === "all" ? te = this.languageUtils.toResolveHierarchy(i.lng || this.language) : te.push(i.lng || this.language);
        const y = (Z, ae, b) => {
          const he = L && b !== p ? b : V;
          this.options.missingKeyHandler ? this.options.missingKeyHandler(Z, l, ae, he, W, i) : this.backendConnector?.saveMissing && this.backendConnector.saveMissing(Z, l, ae, he, W, i), this.emit("missingKey", Z, l, ae, p);
        };
        this.options.saveMissing && (this.options.saveMissingPlurals && E ? te.forEach((Z) => {
          const ae = this.pluralResolver.getSuffixes(Z, i);
          j && i[`defaultValue${this.options.pluralSeparator}zero`] && !ae.includes(`${this.options.pluralSeparator}zero`) && ae.push(`${this.options.pluralSeparator}zero`), ae.forEach((b) => {
            y([Z], a + b, i[`defaultValue${b}`] || F);
          });
        }) : y(te, a, F));
      }
      p = this.extendTranslation(p, t, i, d, r), _ && p === a && this.options.appendNamespaceToMissingKey && (p = `${l}${c}${a}`), (_ || M) && this.options.parseMissingKeyHandler && (p = this.options.parseMissingKeyHandler(this.options.appendNamespaceToMissingKey ? `${l}${c}${a}` : a, M ? p : void 0, i));
    }
    return s ? (d.res = p, d.usedParams = this.getUsedParamsDetails(i), d) : p;
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
      const u = $(t) && (r?.interpolation?.skipOnVariables !== void 0 ? r.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables);
      let l;
      if (u) {
        const f = t.match(this.interpolator.nestingRegexp);
        l = f && f.length;
      }
      let c = r.replace && !$(r.replace) ? r.replace : r;
      if (this.options.interpolation.defaultVariables && (c = {
        ...this.options.interpolation.defaultVariables,
        ...c
      }), t = this.interpolator.interpolate(t, c, r.lng || this.language || i.usedLng, r), u) {
        const f = t.match(this.interpolator.nestingRegexp), h = f && f.length;
        l < h && (r.nest = !1);
      }
      !r.lng && i && i.res && (r.lng = this.language || i.usedLng), r.nest !== !1 && (t = this.interpolator.nest(t, (...f) => s?.[0] === f[0] && !r.context ? (this.logger.warn(`It seems you are nesting recursively key: ${f[0]} in key: ${n[0]}`), null) : this.translate(...f, n), r)), r.interpolation && this.interpolator.reset();
    }
    const o = r.postProcess || this.options.postProcess, a = $(o) ? [o] : o;
    return t != null && a?.length && r.applyPostProcessor !== !1 && (t = Wi.handle(a, t, n, this.options && this.options.postProcessPassResolved ? {
      i18nResolved: {
        ...i,
        usedParams: this.getUsedParamsDetails(r)
      },
      ...r
    } : r, this)), t;
  }
  resolve(t, n = {}) {
    let r, i, s, o, a;
    return $(t) && (t = [t]), Array.isArray(t) && (t = t.map((u) => typeof u == "function" ? it(u, {
      ...this.options,
      ...n
    }) : u)), t.forEach((u) => {
      if (this.isValidLookup(r)) return;
      const l = this.extractFromKey(u, n), c = l.key;
      i = c;
      let f = l.namespaces;
      this.options.fallbackNS && (f = f.concat(this.options.fallbackNS));
      const h = n.count !== void 0 && !$(n.count), d = h && !n.ordinal && n.count === 0, p = n.context !== void 0 && ($(n.context) || typeof n.context == "number") && n.context !== "", m = n.lngs ? n.lngs : this.languageUtils.toResolveHierarchy(n.lng || this.language, n.fallbackLng);
      f.forEach((v) => {
        this.isValidLookup(r) || (a = v, !this.checkedLoadedFor[`${m[0]}-${v}`] && this.utils?.hasLoadedNamespace && !this.utils?.hasLoadedNamespace(a) && (this.checkedLoadedFor[`${m[0]}-${v}`] = !0, this.logger.warn(`key "${i}" for languages "${m.join(", ")}" won't get resolved as namespace "${a}" was not yet loaded`, "This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!")), m.forEach((k) => {
          if (this.isValidLookup(r)) return;
          o = k;
          const C = [c];
          if (this.i18nFormat?.addLookupKeys)
            this.i18nFormat.addLookupKeys(C, c, k, v, n);
          else {
            let E;
            h && (E = this.pluralResolver.getSuffix(k, n.count, n));
            const L = `${this.options.pluralSeparator}zero`, x = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`;
            if (h && (n.ordinal && E.startsWith(x) && C.push(c + E.replace(x, this.options.pluralSeparator)), C.push(c + E), d && C.push(c + L)), p) {
              const R = `${c}${this.options.contextSeparator || "_"}${n.context}`;
              C.push(R), h && (n.ordinal && E.startsWith(x) && C.push(R + E.replace(x, this.options.pluralSeparator)), C.push(R + E), d && C.push(R + L));
            }
          }
          let S;
          for (; S = C.pop(); )
            this.isValidLookup(r) || (s = S, r = this.getResource(k, v, S, n));
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
    const n = ["defaultValue", "ordinal", "context", "replace", "lng", "lngs", "fallbackLng", "ns", "keySeparator", "nsSeparator", "returnObjects", "returnDetails", "joinArrays", "postProcess", "interpolation"], r = t.replace && !$(t.replace);
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
class Ar {
  constructor(t) {
    this.options = t, this.supportedLngs = this.options.supportedLngs || !1, this.logger = Te.create("languageUtils");
  }
  getScriptPartFromCode(t) {
    if (t = Et(t), !t || !t.includes("-")) return null;
    const n = t.split("-");
    return n.length === 2 || (n.pop(), n[n.length - 1].toLowerCase() === "x") ? null : this.formatLanguageCode(n.join("-"));
  }
  getLanguagePartFromCode(t) {
    if (t = Et(t), !t || !t.includes("-")) return t;
    const n = t.split("-");
    return this.formatLanguageCode(n[0]);
  }
  formatLanguageCode(t) {
    if ($(t) && t.includes("-")) {
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
    if (typeof t == "function" && (t = t(n)), $(t) && (t = [t]), Array.isArray(t)) return t;
    if (!n) return t.default || [];
    let r = t[n];
    return r || (r = t[this.getScriptPartFromCode(n)]), r || (r = t[this.formatLanguageCode(n)]), r || (r = t[this.getLanguagePartFromCode(n)]), r || (r = t.default), r || [];
  }
  toResolveHierarchy(t, n) {
    const r = this.getFallbackCodes((n === !1 ? [] : n) || this.options.fallbackLng || [], t), i = [], s = (o) => {
      o && (this.isSupportedCode(o) ? i.push(o) : this.logger.warn(`rejecting language code not found in supportedLngs: ${o}`));
    };
    return $(t) && (t.includes("-") || t.includes("_")) ? (this.options.load !== "languageOnly" && s(this.formatLanguageCode(t)), this.options.load !== "languageOnly" && this.options.load !== "currentOnly" && s(this.getScriptPartFromCode(t)), this.options.load !== "currentOnly" && s(this.getLanguagePartFromCode(t))) : $(t) && s(this.formatLanguageCode(t)), r.forEach((o) => {
      i.includes(o) || s(this.formatLanguageCode(o));
    }), i;
  }
}
const Rr = {
  zero: 0,
  one: 1,
  two: 2,
  few: 3,
  many: 4,
  other: 5
}, Or = {
  select: (e) => e === 1 ? "one" : "other",
  resolvedOptions: () => ({
    pluralCategories: ["one", "other"]
  })
};
class Bo {
  constructor(t, n = {}) {
    this.languageUtils = t, this.options = n, this.logger = Te.create("pluralResolver"), this.pluralRulesCache = {};
  }
  clearCache() {
    this.pluralRulesCache = {};
  }
  getRule(t, n = {}) {
    const r = Et(t === "dev" ? "en" : t), i = n.ordinal ? "ordinal" : "cardinal", s = JSON.stringify({
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
        return this.logger.error("No Intl support, please use an Intl polyfill!"), Or;
      if (!t.match(/-|_/)) return Or;
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
    return r || (r = this.getRule("dev", n)), r ? r.resolvedOptions().pluralCategories.sort((i, s) => Rr[i] - Rr[s]).map((i) => `${this.options.prepend}${n.ordinal ? `ordinal${this.options.prepend}` : ""}${i}`) : [];
  }
  getSuffix(t, n, r = {}) {
    const i = this.getRule(t, r);
    return i ? `${this.options.prepend}${r.ordinal ? `ordinal${this.options.prepend}` : ""}${i.select(n)}` : (this.logger.warn(`no plural rule found for: ${t}`), this.getSuffix("dev", n, r));
  }
}
const Pr = (e, t, n, r = ".", i = !0) => {
  let s = Oo(e, t, n);
  return !s && i && $(n) && (s = Rn(e, n, r), s === void 0 && (s = Rn(t, n, r))), s;
}, Vo = (e) => e.replace(/\$/g, "$$$$");
class Dr {
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
      unescapeSuffix: c,
      unescapePrefix: f,
      nestingPrefix: h,
      nestingPrefixEscaped: d,
      nestingSuffix: p,
      nestingSuffixEscaped: m,
      nestingOptionsSeparator: v,
      maxReplaces: k,
      alwaysFormat: C
    } = t.interpolation;
    this.escape = n !== void 0 ? n : Do, this.escapeValue = r !== void 0 ? r : !0, this.useRawValueToEscape = i !== void 0 ? i : !1, this.prefix = s ? Oe(s) : o || "{{", this.suffix = a ? Oe(a) : u || "}}", this.formatSeparator = l || ",", this.unescapePrefix = c ? "" : f ? Oe(f) : "-", this.unescapeSuffix = this.unescapePrefix ? "" : c ? Oe(c) : "", this.nestingPrefix = h ? Oe(h) : d || Oe("$t("), this.nestingSuffix = p ? Oe(p) : m || Oe(")"), this.nestingOptionsSeparator = v || ",", this.maxReplaces = k || 1e3, this.alwaysFormat = C !== void 0 ? C : !1, this.resetRegExp();
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
    const u = this.options && this.options.interpolation && this.options.interpolation.defaultVariables || {}, l = (d) => {
      if (!d.includes(this.formatSeparator)) {
        const k = Pr(n, u, d, this.options.keySeparator, this.options.ignoreJSONStructure);
        return this.alwaysFormat ? this.format(k, void 0, r, {
          ...i,
          ...n,
          interpolationkey: d
        }) : k;
      }
      const p = d.split(this.formatSeparator), m = p.shift().trim(), v = p.join(this.formatSeparator).trim();
      return this.format(Pr(n, u, m, this.options.keySeparator, this.options.ignoreJSONStructure), v, r, {
        ...i,
        ...n,
        interpolationkey: m
      });
    };
    this.resetRegExp(), !this.escapeValue && typeof t == "string" && /\$t\([^)]*\{[^}]*\{\{/.test(t) && this.logger.warn("nesting options string contains interpolated variables with escapeValue: false — if any of those values are attacker-controlled they can inject additional nesting options (e.g. redirect lng/ns). Sanitise untrusted input before passing it to t(), or keep escapeValue: true.");
    const c = i?.missingInterpolationHandler || this.options.missingInterpolationHandler, f = i?.interpolation?.skipOnVariables !== void 0 ? i.interpolation.skipOnVariables : this.options.interpolation.skipOnVariables;
    return [{
      regex: this.regexpUnescape,
      safeValue: (d) => d
    }, {
      regex: this.regexp,
      safeValue: (d) => this.escapeValue ? this.escape(d) : d
    }].forEach((d) => {
      for (a = 0; s = d.regex.exec(t); ) {
        const p = s[1].trim();
        if (o = l(p), o === void 0)
          if (typeof c == "function") {
            const v = c(t, s, i);
            o = $(v) ? v : "";
          } else if (i && Object.prototype.hasOwnProperty.call(i, p))
            o = "";
          else if (f) {
            o = s[0];
            continue;
          } else
            this.logger.warn(`missed to pass in variable ${p} for interpolating ${t}`), o = "";
        else !$(o) && !this.useRawValueToEscape && (o = Er(o));
        const m = d.safeValue(o);
        if (t = t.replace(s[0], Vo(m)), f ? (d.regex.lastIndex += m.length, d.regex.lastIndex -= s[0].length) : d.regex.lastIndex = 0, a++, a >= this.maxReplaces)
          break;
      }
    }), t;
  }
  nest(t, n, r = {}) {
    let i, s, o;
    const a = (u, l) => {
      const c = this.nestingOptionsSeparator;
      if (!u.includes(c)) return u;
      const f = u.split(new RegExp(`${Oe(c)}[ ]*{`));
      let h = `{${f[1]}`;
      u = f[0], h = this.interpolate(h, o);
      const d = h.match(/'/g), p = h.match(/"/g);
      ((d?.length ?? 0) % 2 === 0 && !p || (p?.length ?? 0) % 2 !== 0) && (h = h.replace(/'/g, '"'));
      try {
        o = JSON.parse(h), l && (o = {
          ...l,
          ...o
        });
      } catch (m) {
        return this.logger.warn(`failed parsing options string in nesting for key ${u}`, m), `${u}${c}${h}`;
      }
      return o.defaultValue && o.defaultValue.includes(this.prefix) && delete o.defaultValue, u;
    };
    for (; i = this.nestingRegexp.exec(t); ) {
      let u = [];
      o = {
        ...r
      }, o = o.replace && !$(o.replace) ? o.replace : o, o.applyPostProcessor = !1, delete o.defaultValue;
      const l = /{.*}/s.test(i[1]) ? i[1].lastIndexOf("}") + 1 : i[1].indexOf(this.formatSeparator);
      if (l !== -1 && (u = i[1].slice(l).split(this.formatSeparator).map((c) => c.trim()).filter(Boolean), i[1] = i[1].slice(0, l)), s = n(a.call(this, i[1].trim(), o), o), s && i[0] === t && !$(s)) return s;
      $(s) || (s = Er(s)), s || (this.logger.warn(`missed to resolve ${i[1]} for nesting ${t}`), s = ""), u.length && (s = u.reduce((c, f) => this.format(c, f, r.lng, {
        ...r,
        interpolationkey: i[1].trim()
      }), s.trim())), t = t.replace(i[0], s), this.regexp.lastIndex = 0;
    }
    return t;
  }
}
const Ho = (e) => {
  let t = e.toLowerCase().trim();
  const n = {};
  if (e.includes("(")) {
    const r = e.split("(");
    t = r[0].toLowerCase().trim();
    const i = r[1].slice(0, -1);
    t === "currency" && !i.includes(":") ? n.currency || (n.currency = i.trim()) : t === "relativetime" && !i.includes(":") ? n.range || (n.range = i.trim()) : i.split(";").forEach((o) => {
      if (o) {
        const [a, ...u] = o.split(":"), l = u.join(":").trim().replace(/^'+|'+$/g, ""), c = a.trim();
        n[c] || (n[c] = l), l === "false" && (n[c] = !1), l === "true" && (n[c] = !0), isNaN(l) || (n[c] = parseInt(l, 10));
      }
    });
  }
  return {
    formatName: t,
    formatOptions: n
  };
}, _r = (e) => {
  const t = {};
  return (n, r, i) => {
    let s = i;
    i && i.interpolationkey && i.formatParams && i.formatParams[i.interpolationkey] && i[i.interpolationkey] && (s = {
      ...s,
      [i.interpolationkey]: void 0
    });
    const o = r + JSON.stringify(s);
    let a = t[o];
    return a || (a = e(Et(r), i), t[o] = a), a(n);
  };
}, Uo = (e) => (t, n, r) => e(Et(n), r)(t);
class qo {
  constructor(t = {}) {
    this.logger = Te.create("formatter"), this.options = t, this.init(t);
  }
  init(t, n = {
    interpolation: {}
  }) {
    this.formatSeparator = n.interpolation.formatSeparator || ",";
    const r = n.cacheInBuiltFormats ? _r : Uo;
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
    this.formats[t.toLowerCase().trim()] = _r(n);
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
        formatName: c,
        formatOptions: f
      } = Ho(l);
      if (this.formats[c]) {
        let h = u;
        try {
          const d = i?.formatParams?.[i.interpolationkey] || {}, p = d.locale || d.lng || i.locale || i.lng || r;
          h = this.formats[c](u, p, {
            ...f,
            ...i,
            ...d
          });
        } catch (d) {
          this.logger.warn(d);
        }
        return h;
      } else
        this.logger.warn(`there was no format function for ${c}`);
      return u;
    }, t);
  }
}
const Ko = (e, t) => {
  e.pending[t] !== void 0 && (delete e.pending[t], e.pendingCount--);
};
class Wo extends Jt {
  constructor(t, n, r, i = {}) {
    super(), this.backend = t, this.store = n, this.services = r, this.languageUtils = r.languageUtils, this.options = i, this.logger = Te.create("backendConnector"), this.waitingReads = [], this.maxParallelReads = i.maxParallelReads || 10, this.readingCalls = 0, this.maxRetries = i.maxRetries >= 0 ? i.maxRetries : 5, this.retryTimeout = i.retryTimeout >= 1 ? i.retryTimeout : 350, this.state = {}, this.queue = [], this.backend?.init?.(r, i.backend, i);
  }
  queueLoad(t, n, r, i) {
    const s = {}, o = {}, a = {}, u = {};
    return t.forEach((l) => {
      let c = !0;
      n.forEach((f) => {
        const h = `${l}|${f}`;
        !r.reload && this.store.hasResourceBundle(l, f) ? this.state[h] = 2 : this.state[h] < 0 || (this.state[h] === 1 ? o[h] === void 0 && (o[h] = !0) : (this.state[h] = 1, c = !1, o[h] === void 0 && (o[h] = !0), s[h] === void 0 && (s[h] = !0), u[f] === void 0 && (u[f] = !0)));
      }), c || (a[l] = !0);
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
      Ro(u.loaded, [s], o), Ko(u, t), n && u.errors.push(n), u.pendingCount === 0 && !u.done && (Object.keys(u.loaded).forEach((l) => {
        a[l] || (a[l] = {});
        const c = u.loaded[l];
        c.length && c.forEach((f) => {
          a[l][f] === void 0 && (a[l][f] = !0);
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
    const a = (l, c) => {
      if (this.readingCalls--, this.waitingReads.length > 0) {
        const f = this.waitingReads.shift();
        this.read(f.lng, f.ns, f.fcName, f.tried, f.wait, f.callback);
      }
      if (l && c && i < this.maxRetries) {
        setTimeout(() => {
          this.read(t, n, r, i + 1, s * 2, o);
        }, s);
        return;
      }
      o(l, c);
    }, u = this.backend[r].bind(this.backend);
    if (u.length === 2) {
      try {
        const l = u(t, n);
        l && typeof l.then == "function" ? l.then((c) => a(null, c)).catch(a) : a(null, l);
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
    $(t) && (t = this.languageUtils.toResolveHierarchy(t)), $(n) && (n = [n]);
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
            let c;
            l.length === 5 ? c = l(t, n, r, i, u) : c = l(t, n, r, i), c && typeof c.then == "function" ? c.then((f) => a(null, f)).catch(a) : a(null, c);
          } catch (c) {
            a(c);
          }
        else
          l(t, n, r, i, a, u);
      }
      !t || !t[0] || this.store.addResource(t[0], n, r, i);
    }
  }
}
const rn = () => ({
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
    if (typeof e[1] == "object" && (t = e[1]), $(e[1]) && (t.defaultValue = e[1]), $(e[2]) && (t.tDescription = e[2]), typeof e[2] == "object" || typeof e[3] == "object") {
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
}), Fr = (e) => ($(e.ns) && (e.ns = [e.ns]), $(e.fallbackLng) && (e.fallbackLng = [e.fallbackLng]), $(e.fallbackNS) && (e.fallbackNS = [e.fallbackNS]), e.supportedLngs && !e.supportedLngs.includes("cimode") && (e.supportedLngs = e.supportedLngs.concat(["cimode"])), e), Ot = () => {
}, Go = (e) => {
  Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach((n) => {
    typeof e[n] == "function" && (e[n] = e[n].bind(e));
  });
};
class vt extends Jt {
  constructor(t = {}, n) {
    if (super(), this.options = Fr(t), this.services = {}, this.logger = Te, this.modules = {
      external: []
    }, Go(this), n && !this.isInitialized && !t.isClone) {
      if (!this.options.initAsync)
        return this.init(t, n), this;
      setTimeout(() => {
        this.init(t, n);
      }, 0);
    }
  }
  init(t = {}, n) {
    this.isInitializing = !0, typeof t == "function" && (n = t, t = {}), t.defaultNS == null && t.ns && ($(t.ns) ? t.defaultNS = t.ns : t.ns.includes("translation") || (t.defaultNS = t.ns[0]));
    const r = rn();
    this.options = {
      ...r,
      ...this.options,
      ...Fr(t)
    }, this.options.interpolation = {
      ...r.interpolation,
      ...this.options.interpolation
    }, t.keySeparator !== void 0 && (this.options.userDefinedKeySeparator = t.keySeparator), t.nsSeparator !== void 0 && (this.options.userDefinedNsSeparator = t.nsSeparator), typeof this.options.overloadTranslationOptionHandler != "function" && (this.options.overloadTranslationOptionHandler = r.overloadTranslationOptionHandler);
    const i = (l) => l ? typeof l == "function" ? new l() : l : null;
    if (!this.options.isClone) {
      this.modules.logger ? Te.init(i(this.modules.logger), this.options) : Te.init(null, this.options);
      let l;
      this.modules.formatter ? l = this.modules.formatter : l = qo;
      const c = new Ar(this.options);
      this.store = new Lr(this.options.resources, this.options);
      const f = this.services;
      f.logger = Te, f.resourceStore = this.store, f.languageUtils = c, f.pluralResolver = new Bo(c, {
        prepend: this.options.pluralSeparator
      }), l && (f.formatter = i(l), f.formatter.init && f.formatter.init(f, this.options), this.options.interpolation.format = f.formatter.format.bind(f.formatter)), f.interpolator = new Dr(this.options), f.utils = {
        hasLoadedNamespace: this.hasLoadedNamespace.bind(this)
      }, f.backendConnector = new Wo(i(this.modules.backend), f.resourceStore, f, this.options), f.backendConnector.on("*", (h, ...d) => {
        this.emit(h, ...d);
      }), this.modules.languageDetector && (f.languageDetector = i(this.modules.languageDetector), f.languageDetector.init && f.languageDetector.init(f, this.options.detection, this.options)), this.modules.i18nFormat && (f.i18nFormat = i(this.modules.i18nFormat), f.i18nFormat.init && f.i18nFormat.init(this)), this.translator = new Ut(this.services, this.options), this.translator.on("*", (h, ...d) => {
        this.emit(h, ...d);
      }), this.modules.external.forEach((h) => {
        h.init && h.init(this);
      });
    }
    if (this.format = this.options.interpolation.format, n || (n = Ot), this.options.fallbackLng && !this.services.languageDetector && !this.options.lng) {
      const l = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng);
      l.length > 0 && l[0] !== "dev" && (this.options.lng = l[0]);
    }
    !this.services.languageDetector && !this.options.lng && this.logger.warn("init: no languageDetector is used and no lng is defined"), ["getResource", "hasResourceBundle", "getResourceBundle", "getDataByLanguage"].forEach((l) => {
      this[l] = (...c) => this.store[l](...c);
    }), ["addResource", "addResources", "addResourceBundle", "removeResourceBundle"].forEach((l) => {
      this[l] = (...c) => (this.store[l](...c), this);
    });
    const a = dt(), u = () => {
      const l = (c, f) => {
        this.isInitializing = !1, this.isInitialized && !this.initializedStoreOnce && this.logger.warn("init: i18next is already initialized. You should call init just once!"), this.isInitialized = !0, this.options.isClone || this.logger.log("initialized", this.options), this.emit("initialized", this.options), a.resolve(f), n(c, f);
      };
      if ((this.languages || this.isLanguageChangingTo) && !this.isInitialized) return l(null, this.t.bind(this));
      this.changeLanguage(this.options.lng, l);
    };
    return this.options.resources || !this.options.initAsync ? u() : setTimeout(u, 0), a;
  }
  loadResources(t, n = Ot) {
    let r = n;
    const i = $(t) ? t : this.language;
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
    const i = dt();
    return typeof t == "function" && (r = t, t = void 0), typeof n == "function" && (r = n, n = void 0), t || (t = this.languages), n || (n = this.options.ns), r || (r = Ot), this.services.backendConnector.reload(t, n, (s) => {
      i.resolve(), r(s);
    }), i;
  }
  use(t) {
    if (!t) throw new Error("You are passing an undefined module! Please check the object you are passing to i18next.use()");
    if (!t.type) throw new Error("You are passing a wrong module! Please check the object you are passing to i18next.use()");
    return t.type === "backend" && (this.modules.backend = t), (t.type === "logger" || t.log && t.warn && t.error) && (this.modules.logger = t), t.type === "languageDetector" && (this.modules.languageDetector = t), t.type === "i18nFormat" && (this.modules.i18nFormat = t), t.type === "postProcessor" && Wi.addPostProcessor(t), t.type === "formatter" && (this.modules.formatter = t), t.type === "3rdParty" && this.modules.external.push(t), this;
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
    const r = dt();
    this.emit("languageChanging", t);
    const i = (a) => {
      this.language = a, this.languages = this.services.languageUtils.toResolveHierarchy(a), this.resolvedLanguage = void 0, this.setResolvedLanguage(a);
    }, s = (a, u) => {
      u ? this.isLanguageChangingTo === t && (i(u), this.translator.changeLanguage(u), this.isLanguageChangingTo = void 0, this.emit("languageChanged", u), this.logger.log("languageChanged", u)) : this.isLanguageChangingTo = void 0, r.resolve((...l) => this.t(...l)), n && n(a, (...l) => this.t(...l));
    }, o = (a) => {
      !t && !a && this.services.languageDetector && (a = []);
      const u = $(a) ? a : a && a[0], l = this.store.hasLanguageSomeTranslations(u) ? u : this.services.languageUtils.getBestMatchFromCodes($(a) ? [a] : a);
      l && (this.language || i(l), this.translator.language || this.translator.changeLanguage(l), this.services.languageDetector?.cacheUserLanguage?.(l)), this.loadResources(l, (c) => {
        s(c, l);
      });
    };
    return !t && this.services.languageDetector && !this.services.languageDetector.async ? o(this.services.languageDetector.detect()) : !t && this.services.languageDetector && this.services.languageDetector.async ? this.services.languageDetector.detect.length === 0 ? this.services.languageDetector.detect().then(o) : this.services.languageDetector.detect(o) : o(t), r;
  }
  getFixedT(t, n, r, i) {
    const s = i?.scopeNs, o = (a, u, ...l) => {
      let c;
      typeof u != "object" ? c = this.options.overloadTranslationOptionHandler([a, u].concat(l)) : c = {
        ...u
      }, c.lng = c.lng || o.lng, c.lngs = c.lngs || o.lngs;
      const f = c.ns !== void 0 && c.ns !== null;
      c.ns = c.ns || o.ns, c.keyPrefix !== "" && (c.keyPrefix = c.keyPrefix || r || o.keyPrefix);
      const h = {
        ...this.options,
        ...c
      };
      Array.isArray(s) && !f && (h.ns = s), typeof c.keyPrefix == "function" && (c.keyPrefix = it(c.keyPrefix, h));
      const d = this.options.keySeparator || ".";
      let p;
      return c.keyPrefix && Array.isArray(a) ? p = a.map((m) => (typeof m == "function" && (m = it(m, h)), `${c.keyPrefix}${d}${m}`)) : (typeof a == "function" && (a = it(a, h)), p = c.keyPrefix ? `${c.keyPrefix}${d}${a}` : a), this.t(p, c);
    };
    return $(t) ? o.lng = t : o.lngs = t, o.ns = n, o.keyPrefix = r, o;
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
    const r = dt();
    return this.options.ns ? ($(t) && (t = [t]), t.forEach((i) => {
      this.options.ns.includes(i) || this.options.ns.push(i);
    }), this.loadResources((i) => {
      r.resolve(), n && n(i);
    }), r) : (n && n(), Promise.resolve());
  }
  loadLanguages(t, n) {
    const r = dt();
    $(t) && (t = [t]);
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
    const n = ["ar", "shu", "sqr", "ssh", "xaa", "yhd", "yud", "aao", "abh", "abv", "acm", "acq", "acw", "acx", "acy", "adf", "ads", "aeb", "aec", "afb", "ajp", "apc", "apd", "arb", "arq", "ars", "ary", "arz", "auz", "avl", "ayh", "ayl", "ayn", "ayp", "bbz", "pga", "he", "iw", "ps", "pbt", "pbu", "pst", "prp", "prd", "ug", "ur", "ydd", "yds", "yih", "ji", "yi", "hbo", "men", "xmn", "fa", "jpr", "peo", "pes", "prs", "dv", "sam", "ckb"], r = this.services?.languageUtils || new Ar(rn());
    return t.toLowerCase().indexOf("-latn") > 1 ? "ltr" : n.includes(r.getLanguagePartFromCode(t)) || t.toLowerCase().indexOf("-arab") > 1 ? "rtl" : "ltr";
  }
  static createInstance(t = {}, n) {
    const r = new vt(t, n);
    return r.createInstance = vt.createInstance, r;
  }
  cloneInstance(t = {}, n = Ot) {
    const r = t.forkResourceStore;
    r && delete t.forkResourceStore;
    const i = {
      ...this.options,
      ...t,
      isClone: !0
    }, s = new vt(i);
    if ((t.debug !== void 0 || t.prefix !== void 0) && (s.logger = s.logger.clone(t)), ["store", "services", "language"].forEach((a) => {
      s[a] = this[a];
    }), s.services = {
      ...this.services
    }, s.services.utils = {
      hasLoadedNamespace: s.hasLoadedNamespace.bind(s)
    }, r) {
      const a = Object.keys(this.store.data).reduce((u, l) => (u[l] = {
        ...this.store.data[l]
      }, u[l] = Object.keys(u[l]).reduce((c, f) => (c[f] = {
        ...u[l][f]
      }, c), u[l]), u), {});
      s.store = new Lr(a, i), s.services.resourceStore = s.store;
    }
    if (t.interpolation) {
      const u = {
        ...rn().interpolation,
        ...this.options.interpolation,
        ...t.interpolation
      }, l = {
        ...i,
        interpolation: u
      };
      s.services.interpolator = new Dr(l);
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
const de = vt.createInstance();
de.createInstance;
de.dir;
de.init;
de.loadResources;
de.reloadResources;
de.use;
de.changeLanguage;
de.getFixedT;
de.t;
de.exists;
de.setDefaultNamespace;
de.hasLoadedNamespace;
de.loadNamespaces;
de.loadLanguages;
function Ji(e) {
  return e && e.__esModule && Object.prototype.hasOwnProperty.call(e, "default") ? e.default : e;
}
const Jo = (e, t, n, r) => {
  const i = [n, {
    code: t,
    ...r || {}
  }];
  if (e?.services?.logger?.forward)
    return e.services.logger.forward(i, "warn", "react-i18next::", !0);
  qe(i[0]) && (i[0] = `react-i18next:: ${i[0]}`), e?.services?.logger?.warn ? e.services.logger.warn(...i) : console?.warn && console.warn(...i);
}, Mr = {}, jt = (e, t, n, r) => {
  qe(n) && Mr[n] || (qe(n) && (Mr[n] = /* @__PURE__ */ new Date()), Jo(e, t, n, r));
}, Yi = (e, t) => () => {
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
}, On = (e, t, n) => {
  e.loadNamespaces(t, Yi(e, n));
}, zr = (e, t, n, r) => {
  if (qe(n) && (n = [n]), e.options.preload && e.options.preload.indexOf(t) > -1) return On(e, n, r);
  n.forEach((i) => {
    e.options.ns.indexOf(i) < 0 && e.options.ns.push(i);
  }), e.loadLanguages(t, Yi(e, r));
}, Yo = (e, t, n = {}) => !t.languages || !t.languages.length ? (jt(t, "NO_LANGUAGES", "i18n.languages were undefined or empty", {
  languages: t.languages
}), !0) : t.hasLoadedNamespace(e, {
  lng: n.lng,
  precheck: (r, i) => {
    if (n.bindI18n && n.bindI18n.indexOf("languageChanging") > -1 && r.services.backendConnector.backend && r.isLanguageChangingTo && !i(r.isLanguageChangingTo, e)) return !1;
  }
}), qe = (e) => typeof e == "string", Qo = (e) => typeof e == "object" && e !== null, Xo = /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g, Zo = {
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
}, ea = (e) => Zo[e], ta = (e) => e.replace(Xo, ea);
let Pn = {
  bindI18n: "languageChanged",
  bindI18nStore: "",
  transEmptyNodeValue: "",
  transSupportBasicHtmlNodes: !0,
  transWrapTextNodes: "",
  transKeepBasicHtmlNodesFor: ["br", "strong", "i", "p"],
  useSuspense: !0,
  unescape: ta,
  transDefaultProps: void 0
};
const na = (e = {}) => {
  Pn = {
    ...Pn,
    ...e
  };
}, ra = () => Pn;
let Qi;
const ia = (e) => {
  Qi = e;
}, sa = () => Qi, oa = {
  type: "3rdParty",
  init(e) {
    na(e.options.react), ia(e);
  }
}, Xi = Jn();
class aa {
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
var Pt = { exports: {} }, sn = {};
var jr;
function la() {
  if (jr) return sn;
  jr = 1;
  var e = Me;
  function t(f, h) {
    return f === h && (f !== 0 || 1 / f === 1 / h) || f !== f && h !== h;
  }
  var n = typeof Object.is == "function" ? Object.is : t, r = e.useState, i = e.useEffect, s = e.useLayoutEffect, o = e.useDebugValue;
  function a(f, h) {
    var d = h(), p = r({ inst: { value: d, getSnapshot: h } }), m = p[0].inst, v = p[1];
    return s(
      function() {
        m.value = d, m.getSnapshot = h, u(m) && v({ inst: m });
      },
      [f, d, h]
    ), i(
      function() {
        return u(m) && v({ inst: m }), f(function() {
          u(m) && v({ inst: m });
        });
      },
      [f]
    ), o(d), d;
  }
  function u(f) {
    var h = f.getSnapshot;
    f = f.value;
    try {
      var d = h();
      return !n(f, d);
    } catch {
      return !0;
    }
  }
  function l(f, h) {
    return h();
  }
  var c = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? l : a;
  return sn.useSyncExternalStore = e.useSyncExternalStore !== void 0 ? e.useSyncExternalStore : c, sn;
}
var on = {};
var $r;
function ua() {
  return $r || ($r = 1, process.env.NODE_ENV !== "production" && (function() {
    function e(d, p) {
      return d === p && (d !== 0 || 1 / d === 1 / p) || d !== d && p !== p;
    }
    function t(d, p) {
      c || i.startTransition === void 0 || (c = !0, console.error(
        "You are using an outdated, pre-release alpha of React 18 that does not support useSyncExternalStore. The use-sync-external-store shim will not work correctly. Upgrade to a newer pre-release."
      ));
      var m = p();
      if (!f) {
        var v = p();
        s(m, v) || (console.error(
          "The result of getSnapshot should be cached to avoid an infinite loop"
        ), f = !0);
      }
      v = o({
        inst: { value: m, getSnapshot: p }
      });
      var k = v[0].inst, C = v[1];
      return u(
        function() {
          k.value = m, k.getSnapshot = p, n(k) && C({ inst: k });
        },
        [d, m, p]
      ), a(
        function() {
          return n(k) && C({ inst: k }), d(function() {
            n(k) && C({ inst: k });
          });
        },
        [d]
      ), l(m), m;
    }
    function n(d) {
      var p = d.getSnapshot;
      d = d.value;
      try {
        var m = p();
        return !s(d, m);
      } catch {
        return !0;
      }
    }
    function r(d, p) {
      return p();
    }
    typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStart(Error());
    var i = Me, s = typeof Object.is == "function" ? Object.is : e, o = i.useState, a = i.useEffect, u = i.useLayoutEffect, l = i.useDebugValue, c = !1, f = !1, h = typeof window > "u" || typeof window.document > "u" || typeof window.document.createElement > "u" ? r : t;
    on.useSyncExternalStore = i.useSyncExternalStore !== void 0 ? i.useSyncExternalStore : h, typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < "u" && typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop == "function" && __REACT_DEVTOOLS_GLOBAL_HOOK__.registerInternalModuleStop(Error());
  })()), on;
}
var Br;
function ca() {
  return Br || (Br = 1, process.env.NODE_ENV === "production" ? Pt.exports = la() : Pt.exports = ua()), Pt.exports;
}
var fa = ca();
const da = (e, t) => {
  if (qe(t)) return t;
  if (Qo(t) && qe(t.defaultValue)) return t.defaultValue;
  if (typeof e == "function") return "";
  if (Array.isArray(e)) {
    const n = e[e.length - 1];
    return typeof n == "function" ? "" : n;
  }
  return e;
}, ha = {
  t: da,
  ready: !1
}, pa = () => () => {
}, ee = (e, t = {}) => {
  const {
    i18n: n
  } = t, {
    i18n: r,
    defaultNS: i
  } = Yn(Xi) || {}, s = n || r || sa();
  s && !s.reportNamespaces && (s.reportNamespaces = new aa()), s || jt(s, "NO_I18NEXT_INSTANCE", "useTranslation: You will need to pass in an i18next instance by using initReactI18next or by passing it via props or context. In monorepo setups, make sure there is only one instance of react-i18next.");
  const o = xt(() => ({
    ...ra(),
    ...s?.options?.react,
    ...t
  }), [s, t]), {
    useSuspense: a,
    keyPrefix: u
  } = o, l = i || s?.options?.defaultNS, c = qe(l) ? [l] : l || ["translation"], f = xt(() => c, c);
  s?.reportNamespaces?.addUsedNamespaces?.(f);
  const h = oe(0), d = Ee((F) => {
    if (!s) return pa;
    const {
      bindI18n: w,
      bindI18nStore: A
    } = o, D = () => {
      h.current += 1, F();
    };
    return w && s.on(w, D), A && s.store.on(A, D), () => {
      w && w.split(" ").forEach((M) => s.off(M, D)), A && A.split(" ").forEach((M) => s.store.off(M, D));
    };
  }, [s, o]), p = oe(), m = Ee(() => {
    if (!s)
      return ha;
    const F = !!(s.isInitialized || s.initializedStoreOnce) && f.every((O) => Yo(O, s, o)), w = t.lng || s.language, A = h.current, D = p.current;
    if (D && D.ready === F && D.lng === w && D.keyPrefix === u && D.revision === A)
      return D;
    const _ = {
      t: s.getFixedT(w, o.nsMode === "fallback" ? f : f[0], u, {
        scopeNs: f
      }),
      ready: F,
      lng: w,
      keyPrefix: u,
      revision: A
    };
    return p.current = _, _;
  }, [s, f, u, o, t.lng]), [v, k] = re(0), {
    t: C,
    ready: S
  } = fa.useSyncExternalStore(d, m, m);
  ne(() => {
    if (s && !S && !a) {
      const F = () => k((w) => w + 1);
      t.lng ? zr(s, t.lng, f, F) : On(s, f, F);
    }
  }, [s, t.lng, f, S, a, v]);
  const E = s || {}, L = oe(null), x = oe(), R = (F) => {
    const w = Object.getOwnPropertyDescriptors(F);
    w.__original && delete w.__original;
    const A = Object.create(Object.getPrototypeOf(F), w);
    if (!Object.prototype.hasOwnProperty.call(A, "__original"))
      try {
        Object.defineProperty(A, "__original", {
          value: F,
          writable: !1,
          enumerable: !1,
          configurable: !1
        });
      } catch {
      }
    return A;
  }, j = xt(() => {
    const F = E, w = F?.language;
    let A = F;
    F && (L.current && L.current.__original === F ? x.current !== w ? (A = R(F), L.current = A, x.current = w) : A = L.current : (A = R(F), L.current = A, x.current = w));
    const D = !S && !a ? (..._) => (jt(s, "USE_T_BEFORE_READY", "useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t."), C(..._)) : C, M = [D, A, S];
    return M.t = D, M.i18n = A, M.ready = S, M;
  }, [C, E, S, E.resolvedLanguage, E.language, E.languages]);
  if (s && a && !S) {
    let F = !1;
    try {
      F = process.env.NODE_ENV !== "production";
    } catch {
    }
    throw F && jt(s, "SUSPENDED_WHILE_LOADING", "useTranslation: suspended while translations are loading (useSuspense is true by default). Add a <Suspense> boundary above this component, or set react.useSuspense: false in the i18next init options. https://react.i18next.com/latest/usetranslation-hook"), new Promise((w) => {
      const A = () => w();
      t.lng ? zr(s, t.lng, f, A) : On(s, f, A);
    });
  }
  return j;
};
function Zi({
  i18n: e,
  defaultNS: t,
  children: n
}) {
  const r = xt(() => ({
    i18n: e,
    defaultNS: t
  }), [e, t]);
  return Ui(Xi.Provider, {
    value: r
  }, n);
}
const Qn = [
  { code: "en", label: "English", dir: "ltr" },
  { code: "fr", label: "Français", dir: "ltr" },
  { code: "es", label: "Español", dir: "ltr" },
  { code: "ar", label: "العربية", dir: "rtl" },
  { code: "ru", label: "Русский", dir: "ltr" },
  { code: "zh", label: "中文", dir: "ltr" }
], ga = {
  en: { translation: {
    appTitle: "FlowDesk Assistant",
    reset: "Start over",
    resetConfirm: "Start over? The current conversation and draft will be cleared.",
    emptyTitle: "How can I help?",
    emptySub: "Describe what you need — I will find the service and raise the request.",
    greeting: "Hello, {{name}}! How can I help you today?",
    capabilities: `I can help you:

- **Raise a service request** - I find the right service and fill the form with you
- **Look up your requests** - "my last one", "requests from June", however you describe it
- **Look up your tasks** - the same way
- **Search the knowledge base** - services, forms, what a field means
- **Explain what I can do, and what Altiora is for**

What would you like to do?`,
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
    choice: { yes: "✓ Yes, correct", chooseOther: "Choose another", cancel: "Cancel", done: "Done ({{count}})", skip: "Skip", search: "🔍 Search…", find: "Find", searchUser: "Name or email…", searchLocation: "Location name…" },
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
    capabilities: `Я могу:

- **Оформить сервисную заявку** - найду нужный сервис и заполню форму вместе с вами
- **Показать ваши заявки** - «последняя», «за июнь», как удобно описать
- **Показать ваши задачи** - тем же способом
- **Найти в базе знаний** - сервисы, формы, значение поля
- **Рассказать, что я умею и для чего нужна Altiora**

С чего начнём?`,
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
    choice: { yes: "✓ Да, верно", chooseOther: "Выбрать другого", cancel: "Отмена", done: "Готово ({{count}})", skip: "Пропустить", search: "🔍 Искать…", find: "Найти", searchUser: "Имя или email…", searchLocation: "Название локации…" },
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
    capabilities: `Je peux :

- **Créer une demande de service** - je trouve le service et remplis le formulaire avec vous
- **Retrouver vos demandes** - « la dernière », « celles de juin »
- **Retrouver vos tâches** - de la même façon
- **Chercher dans la base de connaissances** - services, formulaires, sens d’un champ
- **Expliquer ce que je sais faire et à quoi sert Altiora**

Que souhaitez-vous faire ?`,
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
    choice: { yes: "✓ Oui, correct", chooseOther: "Choisir un autre", cancel: "Annuler", done: "Terminé ({{count}})", skip: "Ignorer", search: "🔍 Rechercher…", find: "Trouver", searchUser: "Nom ou e-mail…", searchLocation: "Nom du lieu…" },
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
    capabilities: `Puedo:

- **Crear una solicitud de servicio** - busco el servicio y completo el formulario con usted
- **Consultar sus solicitudes** - «la última», «las de junio»
- **Consultar sus tareas** - del mismo modo
- **Buscar en la base de conocimiento** - servicios, formularios, qué significa un campo
- **Explicar qué puedo hacer y para qué sirve Altiora**

¿Por dónde empezamos?`,
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
    choice: { yes: "✓ Sí, correcto", chooseOther: "Elegir otro", cancel: "Cancelar", done: "Listo ({{count}})", skip: "Omitir", search: "🔍 Buscar…", find: "Buscar", searchUser: "Nombre o correo…", searchLocation: "Nombre del lugar…" },
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
    capabilities: `يمكنني:

- **إنشاء طلب خدمة** - أجد الخدمة المناسبة وأملأ النموذج معك
- **عرض طلباتك** - «آخر طلب»، «طلبات يونيو»
- **عرض مهامك** - بالطريقة نفسها
- **البحث في قاعدة المعرفة** - الخدمات والنماذج ومعنى الحقول
- **شرح ما يمكنني فعله والغرض من Altiora**

من أين نبدأ؟`,
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
    choice: { yes: "✓ نعم، صحيح", chooseOther: "اختر آخر", cancel: "إلغاء", done: "تم ({{count}})", skip: "تخطي", search: "🔍 بحث…", find: "بحث", searchUser: "الاسم أو البريد…", searchLocation: "اسم الموقع…" },
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
    capabilities: `我可以：

- **提交服务请求** - 找到对应服务并与您一起填写表单
- **查看您的请求** - “最近一次”“六月的”，怎么描述都行
- **查看您的任务** - 方式相同
- **搜索知识库** - 服务、表单、字段含义
- **说明我能做什么，以及 Altiora 的用途**

从哪里开始？`,
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
    choice: { yes: "✓ 是的，正确", chooseOther: "选择其他", cancel: "取消", done: "完成 ({{count}})", skip: "跳过", search: "🔍 搜索……", find: "查找", searchUser: "姓名或邮箱……", searchLocation: "地点名称……" },
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
}, es = "fdv2-lang", be = de.createInstance();
be.use(oa).init({
  resources: ga,
  lng: typeof localStorage < "u" && localStorage.getItem(es) || "en",
  fallbackLng: "en",
  supportedLngs: Qn.map((e) => e.code),
  interpolation: { escapeValue: !1 },
  react: { useSuspense: !1 }
});
function ma(e) {
  const t = Qn.find((n) => n.code === e);
  return t ? t.dir : "ltr";
}
function nt() {
  return be.language || "en";
}
function Vr() {
  return ma(nt());
}
function ya(e) {
  be.changeLanguage(e);
  try {
    localStorage.setItem(es, e);
  } catch {
  }
}
const Hr = (e) => {
  let t;
  const n = /* @__PURE__ */ new Set(), r = (l, c) => {
    const f = typeof l == "function" ? l(t) : l;
    if (!Object.is(f, t)) {
      const h = t;
      t = c ?? (typeof f != "object" || f === null) ? f : Object.assign({}, t, f), n.forEach((d) => d(t, h));
    }
  }, i = () => t, a = { setState: r, getState: i, getInitialState: () => u, subscribe: (l) => (n.add(l), () => n.delete(l)) }, u = t = e(r, i, a);
  return a;
}, ba = ((e) => e ? Hr(e) : Hr), xa = (e) => e;
function ka(e, t = xa) {
  const n = Me.useSyncExternalStore(
    e.subscribe,
    Me.useCallback(() => t(e.getState()), [e, t]),
    Me.useCallback(() => t(e.getInitialState()), [e, t])
  );
  return Me.useDebugValue(n), n;
}
const Ur = (e) => {
  const t = ba(e), n = (r) => ka(t, r);
  return Object.assign(n, t), n;
}, va = ((e) => e ? Ur(e) : Ur);
function ts(e, t) {
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
const Dn = (e) => (t) => {
  try {
    const n = e(t);
    return n instanceof Promise ? n : {
      then(r) {
        return Dn(r)(n);
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
        return Dn(r)(n);
      }
    };
  }
}, wa = (e, t) => (n, r, i) => {
  let s = {
    storage: ts(() => window.localStorage),
    partialize: (v) => v,
    version: 0,
    merge: (v, k) => ({
      ...k,
      ...v
    }),
    ...t
  }, o = !1, a = 0;
  const u = /* @__PURE__ */ new Set(), l = /* @__PURE__ */ new Set();
  let c = s.storage;
  if (!c)
    return e(
      (...v) => {
        console.warn(
          `[zustand persist middleware] Unable to update item '${s.name}', the given storage is currently unavailable.`
        ), n(...v);
      },
      r,
      i
    );
  const f = () => {
    const v = s.partialize({ ...r() });
    return c.setItem(s.name, {
      state: v,
      version: s.version
    });
  }, h = i.setState;
  i.setState = (v, k) => (h(v, k), f());
  const d = e(
    (...v) => (n(...v), f()),
    r,
    i
  );
  i.getInitialState = () => d;
  let p;
  const m = () => {
    var v, k;
    if (!c) return;
    const C = ++a;
    o = !1, u.forEach((E) => {
      var L;
      return E((L = r()) != null ? L : d);
    });
    const S = ((k = s.onRehydrateStorage) == null ? void 0 : k.call(s, (v = r()) != null ? v : d)) || void 0;
    return Dn(c.getItem.bind(c))(s.name).then((E) => {
      if (E)
        if (typeof E.version == "number" && E.version !== s.version) {
          if (s.migrate) {
            const L = s.migrate(
              E.state,
              E.version
            );
            return L instanceof Promise ? L.then((x) => [!0, x]) : [!0, L];
          }
          console.error(
            "State loaded from storage couldn't be migrated since no migrate function was provided"
          );
        } else
          return [!1, E.state];
      return [!1, void 0];
    }).then((E) => {
      var L;
      if (C !== a)
        return;
      const [x, R] = E;
      if (p = s.merge(
        R,
        (L = r()) != null ? L : d
      ), n(p, !0), x)
        return f();
    }).then(() => {
      C === a && (S?.(r(), void 0), p = r(), o = !0, l.forEach((E) => E(p)));
    }).catch((E) => {
      C === a && S?.(void 0, E);
    });
  };
  return i.persist = {
    setOptions: (v) => {
      s = {
        ...s,
        ...v
      }, v.storage && (c = v.storage);
    },
    clearStorage: () => {
      c?.removeItem(s.name);
    },
    getOptions: () => s,
    rehydrate: () => m(),
    hasHydrated: () => o,
    onHydrate: (v) => (u.add(v), () => {
      u.delete(v);
    }),
    onFinishHydration: (v) => (l.add(v), () => {
      l.delete(v);
    })
  }, s.skipHydration || m(), p || d;
}, Sa = wa, qr = (e) => Symbol.iterator in e, Kr = (e) => (
  // HACK: avoid checking entries type
  "entries" in e
), Wr = (e, t) => {
  const n = e instanceof Map ? e : new Map(e.entries()), r = t instanceof Map ? t : new Map(t.entries());
  if (n.size !== r.size)
    return !1;
  for (const [i, s] of n)
    if (!r.has(i) || !Object.is(s, r.get(i)))
      return !1;
  return !0;
}, Ca = (e, t) => {
  const n = e[Symbol.iterator](), r = t[Symbol.iterator]();
  let i = n.next(), s = r.next();
  for (; !i.done && !s.done; ) {
    if (!Object.is(i.value, s.value))
      return !1;
    i = n.next(), s = r.next();
  }
  return !!i.done && !!s.done;
};
function Ea(e, t) {
  return Object.is(e, t) ? !0 : typeof e != "object" || e === null || typeof t != "object" || t === null || Object.getPrototypeOf(e) !== Object.getPrototypeOf(t) ? !1 : qr(e) && qr(t) ? Kr(e) && Kr(t) ? Wr(e, t) : Ca(e, t) : Wr(
    { entries: () => Object.entries(e) },
    { entries: () => Object.entries(t) }
  );
}
function Xn(e) {
  const t = Me.useRef(void 0);
  return (n) => {
    const r = e(n);
    return Ea(t.current, r) ? t.current : t.current = r;
  };
}
const _n = {
  apiBaseUrl: "",
  userId: "fdv2-demo-user",
  getAuthHeaders: null,
  fetchImpl: null,
  eventSourceImpl: null,
  onSubmitted: null,
  onError: null,
  onSessionStart: null,
  // REQ-005 — the host opens its own detail dialog when a row in the chat is clicked.
  // Declared here because `configureChat` copies only the keys it already knows: a
  // callback the host passes and this list does not name is dropped without a word,
  // and the rows would simply never open.
  onReveal: null,
  // Host's own dev/prod flag (e.g. import.meta.env.DEV) — NOT this package's own build
  // mode, which is baked in as "production" once bundled regardless of who consumes it.
  debug: !1
};
let Ke = { ..._n };
function Ia(e = {}) {
  const t = { ..._n };
  for (const n of Object.keys(_n))
    e[n] !== void 0 && e[n] !== null && (t[n] = e[n]);
  Ke = t;
}
function ve() {
  return Ke;
}
function Zn(e) {
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
function Gr(e, ...t) {
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
const Na = 12e4, Ta = 3, ot = (e) => Zn(e);
async function ns(e) {
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
async function La(e) {
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
async function Aa(e) {
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
async function Ra(e, t) {
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
async function Oa(e, t, n, { signal: r, choice: i, controlAction: s, anchor: o, formEvent: a, lang: u, userContext: l } = {}) {
  const c = new AbortController(), f = setTimeout(() => c.abort(), Na);
  r && r.addEventListener("abort", () => c.abort(), { once: !0 });
  const h = { sessionId: e, userId: t, lang: u, ...l ? { userContext: l } : {} }, d = o ? { ...h, anchor: o } : s ? { ...h, controlAction: s } : i ? { ...h, choice: i } : a ? { ...h, formEvent: a } : { ...h, message: n };
  let p;
  try {
    p = await Ge()(ot("/flowdesk/chat"), {
      method: "POST",
      headers: await ze({ "Content-Type": "application/json" }),
      body: JSON.stringify(d),
      signal: c.signal
    });
  } catch (k) {
    throw clearTimeout(f), k.name === "AbortError" ? new Q("TIMEOUT", "The assistant took too long to respond.") : new Q("NETWORK", k.message);
  }
  clearTimeout(f);
  const m = await p.json().catch(() => {
    throw new Q("SERVER", `Non-JSON response (HTTP ${p.status})`);
  });
  if (m.error) throw new Q("SERVER", typeof m.error == "string" ? m.error : m.detail || "Chat failed");
  if (!p.ok) throw new Q("SERVER", `chat HTTP ${p.status}`);
  let v = null;
  try {
    v = await ns(e);
  } catch {
  }
  return { ...m, draft: v };
}
const bg = ["connected", "turn:start", "node:start", "node:done", "turn:done"];
function Pa(e, t = {}, n = {}) {
  const r = n.EventSourceImpl || ve().eventSourceImpl || (typeof EventSource < "u" ? EventSource : null);
  if (!r)
    return t.onError?.(new Q("SSE_DISCONNECT", "EventSource unavailable")), () => {
    };
  let i;
  try {
    i = ot(`/flowdesk/chat/${encodeURIComponent(e)}/stream`);
  } catch (f) {
    return t.onError?.(new Q("SSE_DISCONNECT", f.message)), () => {
    };
  }
  let s = null, o = 0, a = !1, u = null;
  const l = (f) => {
    try {
      return JSON.parse(f.data);
    } catch {
      return {};
    }
  }, c = () => {
    s = new r(i, { withCredentials: !0 }), s.onopen = () => {
      o = 0;
    }, s.addEventListener("connected", (f) => t.onConnected?.(l(f))), s.addEventListener("turn:start", (f) => t.onTurnStart?.(l(f))), s.addEventListener("turn:done", (f) => t.onTurnDone?.(l(f))), s.addEventListener("node:start", (f) => {
      const h = l(f);
      t.onNode?.(h.node, "start", h);
    }), s.addEventListener("node:done", (f) => {
      const h = l(f);
      t.onNode?.(h.node, "done", h);
    }), s.onerror = () => {
      if (a) return;
      try {
        s.close();
      } catch {
      }
      if (o >= Ta) {
        t.onError?.(new Q("SSE_DISCONNECT", "Lost progress stream"));
        return;
      }
      o += 1;
      const f = Math.min(1e3 * 2 ** (o - 1), 8e3);
      u = setTimeout(() => {
        a || c();
      }, f);
    };
  };
  return c(), function() {
    a = !0, u && clearTimeout(u);
    try {
      s && s.close();
    } catch {
    }
  };
}
const Ce = { sendMessage: Oa, getDraft: ns, patchDraft: Ra, subscribeProgress: Pa, getSchema: Aa, getVoiceTranscript: La };
let Jr = 0;
function an(e, t, n) {
  return Jr += 1, { id: `m${Date.now()}_${Jr}`, role: e, content: t, timestamp: (/* @__PURE__ */ new Date()).toISOString(), metadata: n || null };
}
function ht(e) {
  console.error("[flowdesk-chat-v2] turn failed:", e);
  const t = {
    NETWORK: "I'm having trouble reaching the server. Check your connection and try again.",
    TIMEOUT: "That took too long to respond — please try again.",
    SSE_DISCONNECT: "I lost the live connection, but you can keep chatting."
  }[e.code] || "Something went wrong on my end. Please try again in a moment.", n = ve().debug ? `${e.code} — ${e.message}` : null;
  return { text: t, metadata: { kind: "chat-error", debugDetail: n } };
}
function pt(e) {
  return {
    choices: e.choices || null,
    // controls[] (I-3): the typed turn-contract; ControlRenderer prefers it, falling
    // back to resolveChoices during the deprecation window.
    controls: Array.isArray(e.controls) ? e.controls : null,
    // REQ-005 — rows the turn SHOWS (requests, tasks). A separate field from
    // `controls` because they collect nothing; see the backend contract.
    cards: Array.isArray(e.cards) ? e.cards : null,
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
function Da() {
  return `fdv2-${typeof crypto < "u" && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}
const ln = () => ({ id: Da(), serviceId: null, schemaVersion: null, status: "idle" }), et = () => ({ slots: {}, beneficiary: null, patches: [] }), un = () => ({ loading: !1, error: null, currentNode: null, composerDisabled: !1, draftPanelOpen: !0, completed: !1 });
function _a(e) {
  let t = { sessionId: null, unsub: null };
  function n(i, s, o) {
    if (t.sessionId === i && t.unsub) return;
    if (t.unsub)
      try {
        t.unsub();
      } catch {
      }
    const a = Ce.subscribeProgress(i, {
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
  return va(
    Sa(
      (i, s) => ({
        session: ln(),
        messages: [],
        draft: et(),
        schema: null,
        // compiled SchemaSnapshot for the active service (labels/phases/dependsOn)
        user: null,
        // the current user profile (from the host) — identity + greeting
        anchorContext: null,
        // Phase 3: UI-anchor the chat was opened from (Phase 4 zero-query source)
        ui: un(),
        actions: {
          /** Append a message (any role). Returns the created message. */
          addMessage: (o, a, u) => {
            const l = an(o, a, u);
            return i((c) => ({ messages: [...c.messages, l] })), l;
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
            const a = o.firstName || (o.displayName ? String(o.displayName).split(/\s+/)[0] : "") || o.name || "", u = `${be.t("greeting", { name: a })}

${be.t("capabilities")}`;
            s().actions.addMessage("assistant", u, { responseType: "greeting" });
          },
          /** Send a turn: optimistic user message → SSE progress + POST → assistant
           *  reply + draft refresh. SSE stays open across turns for the session. */
          sendMessage: async (o, a, u) => {
            const l = (o || "").trim();
            if (!l || s().ui.loading) return;
            const { actions: c } = s(), f = s().session.id, h = s().user?.userId || a || ve().userId;
            c.addMessage("user", l), i((d) => ({ ui: { ...d.ui, loading: !0, error: null, currentNode: null } })), n(f, c.setCurrentNode, () => c.setCurrentNode(null));
            try {
              const d = await Ce.sendMessage(f, h, l, { signal: u, lang: nt(), userContext: s().user || void 0 });
              c.addMessage("assistant", d.response, pt(d)), d.draft && c.updateDraft(d.draft), c.applyTurnResult(d);
              const p = d?.state?.serviceId;
              if (p && s().schema?.serviceId !== p)
                try {
                  const m = await Ce.getSchema(p);
                  m && i(() => ({ schema: m }));
                } catch {
                }
            } catch (d) {
              if (u?.aborted) {
                i((k) => ({ ui: { ...k.ui, loading: !1, currentNode: null } })), c.addMessage("system", be.t("stopped"));
                return;
              }
              const p = d instanceof Q ? d : new Q("SERVER", d.message);
              c.setError({ code: p.code, message: p.message });
              const { text: m, metadata: v } = ht(p);
              c.addMessage("system", m, v);
            }
          },
          /** Phase 4: zero-query explain from a UI anchor. No user bubble — the
           *  assistant opens with context-aware help as the first message. */
          sendAnchorExplain: async (o, a) => {
            const u = o ? { id: o.anchorId, title: o.anchorTitle, initialQuery: o.initialQuery } : null;
            if (!u || !u.id || s().ui.loading) return;
            const { actions: l } = s(), c = s().session.id, f = s().user?.userId || a || ve().userId;
            l.setAnchorContext(o), i((h) => ({ ui: { ...h.ui, loading: !0, error: null, currentNode: null } })), n(c, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const h = await Ce.sendMessage(c, f, null, { anchor: u, lang: nt(), userContext: s().user || void 0 });
              l.addMessage("assistant", h.response, pt(h)), l.applyTurnResult(h);
            } catch (h) {
              const d = h instanceof Q ? h : new Q("SERVER", h.message);
              l.setError({ code: d.code, message: d.message });
              const { text: p, metadata: m } = ht(d);
              l.addMessage("system", p, m);
            }
          },
          /** Send a structured confirm-or-choose selection (F9.1f). */
          sendChoice: async (o, a, u) => {
            if (s().ui.loading) return;
            const { actions: l } = s(), c = s().session.id, f = s().user?.userId || u || ve().userId;
            l.addMessage("user", a || o.value || be.t("choice.yes")), i((h) => ({ ui: { ...h.ui, loading: !0, error: null, currentNode: null } })), n(c, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const h = await Ce.sendMessage(c, f, null, { choice: o, lang: nt(), userContext: s().user || void 0 });
              l.addMessage("assistant", h.response, pt(h)), h.draft && l.updateDraft(h.draft), l.applyTurnResult(h);
              const d = h?.state?.serviceId;
              if (d && s().schema?.serviceId !== d)
                try {
                  const p = await Ce.getSchema(d);
                  p && i(() => ({ schema: p }));
                } catch {
                }
            } catch (h) {
              const d = h instanceof Q ? h : new Q("SERVER", h.message);
              l.setError({ code: d.code, message: d.message });
              const { text: p, metadata: m } = ht(d);
              l.addMessage("system", p, m);
            }
          },
          /** Send a controls[] reply (I-3). Mirrors sendChoice; POSTs {controlAction}. */
          sendControlAction: async (o, a, u) => {
            if (s().ui.loading) return;
            const { actions: l } = s(), c = s().session.id, f = s().user?.userId || u || ve().userId;
            l.addMessage("user", a || o.value || be.t("choice.yes")), i((h) => ({ ui: { ...h.ui, loading: !0, error: null, currentNode: null } })), n(c, l.setCurrentNode, () => l.setCurrentNode(null));
            try {
              const h = await Ce.sendMessage(c, f, null, { controlAction: o, lang: nt(), userContext: s().user || void 0 });
              l.addMessage("assistant", h.response, pt(h)), h.draft && l.updateDraft(h.draft), l.applyTurnResult(h);
              const d = h?.state?.serviceId;
              if (d && s().schema?.serviceId !== d)
                try {
                  const p = await Ce.getSchema(d);
                  p && i(() => ({ schema: p }));
                } catch {
                }
            } catch (h) {
              const d = h instanceof Q ? h : new Q("SERVER", h.message);
              l.setError({ code: d.code, message: d.message });
              const { text: p, metadata: m } = ht(d);
              l.addMessage("system", p, m);
            }
          },
          // P1 — a system signal from the host, not something the user typed. The form
          // reporting a created request is the case today: the assistant closes the draft
          // and offers what to do next. No user bubble is added — nothing was said.
          notifyFormEvent: async (o, a) => {
            if (!o || s().ui.loading) return;
            const { actions: u } = s(), l = s().session.id, c = s().user?.userId || a || ve().userId;
            i((f) => ({ ui: { ...f.ui, loading: !0, error: null, currentNode: null } })), n(l, u.setCurrentNode, () => u.setCurrentNode(null));
            try {
              const f = await Ce.sendMessage(l, c, null, { formEvent: o, lang: nt(), userContext: s().user || void 0 });
              u.addMessage("assistant", f.response, pt(f)), f.draft && u.updateDraft(f.draft), u.applyTurnResult(f);
            } catch (f) {
              const h = f instanceof Q ? f : new Q("SERVER", f.message);
              u.setError({ code: h.code, message: h.message });
              const { text: d, metadata: p } = ht(h);
              u.addMessage("system", d, p);
            } finally {
              i((f) => ({ ui: { ...f.ui, loading: !1 } }));
            }
          },
          startSession: (o = null) => {
            r(), i(() => ({
              session: { ...ln(), serviceId: o },
              messages: [],
              draft: et(),
              schema: null,
              ui: un()
            })), s().actions.seedGreeting();
          },
          resetSession: () => {
            r(), i(() => ({
              session: ln(),
              messages: [],
              draft: et(),
              schema: null,
              ui: un(),
              anchorContext: null
            })), s().actions.seedGreeting();
          },
          /**
           * Addition 4 — the request has been created (the Altiora wizard was submitted
           * after a hand-off): post a closing "glad to help" message and end assisted
           * composition. The draft/service is cleared and the composer is locked; a new
           * request begins a fresh session on the next load. Idempotent within a session.
           */
          completeWithThanks: (o = null) => {
            s().ui.completed || (s().actions.addMessage("assistant", be.t("thanks"), { responseType: "thanks", ...o ? { srNumber: o } : {} }), i((a) => ({
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
            const l = s().messages, c = l[l.length - 1];
            if (c && c.role === o && c.content === a) return;
            const f = { source: "voice", ...u ? { clientTimestamp: u } : {} };
            i((h) => ({ messages: [...h.messages, an(o, a, f)] }));
          },
          /**
           * VF1-005: merge a server-persisted voice transcript into the thread,
           * skipping turns already present (dedup by role+content) so hydration on
           * open never duplicates lines the live bridge already pushed.
           */
          hydrateTranscripts: (o) => {
            !Array.isArray(o) || o.length === 0 || i((a) => {
              const u = new Set(a.messages.map((c) => `${c.role}\0${c.content}`)), l = [];
              for (const c of o) {
                if (!c || c.role !== "user" && c.role !== "assistant" || !c.content) continue;
                const f = `${c.role}\0${c.content}`;
                u.has(f) || (u.add(f), l.push(an(c.role, c.content, { source: c.metadata && c.metadata.source || "voice" })));
              }
              return l.length ? { messages: [...a.messages, ...l] } : {};
            });
          },
          /** VF1-005: fetch this session's persisted voice transcript and hydrate it. */
          loadVoiceHistory: async () => {
            const o = s().session.id;
            try {
              const a = await Ce.getVoiceTranscript(o);
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
            a && Gr("onSubmitted", { srNumber: a, sessionId: s().session.id, serviceId: s().session.serviceId, result: o });
          },
          updateDraft: (o) => i(() => ({ draft: { ...et(), ...o || {} } })),
          /** Inline slot edit from the DraftPanel: optimistic → patchDraft → reconcile. */
          patchSlot: async (o, a) => {
            const u = s().session.id, l = s().draft;
            i((c) => ({ draft: { ...c.draft, slots: { ...c.draft.slots, [o]: { ...c.draft.slots[o] || {}, value: a, provenance: "user_edited", stale: !1 } } } }));
            try {
              const c = await Ce.patchDraft(u, [{ op: "set", slotId: o, value: a, provenance: "user_edited" }]);
              c && c.slots && i(() => ({ draft: { ...et(), ...c } }));
            } catch (c) {
              i(() => ({ draft: l })), s().actions.setError({ code: c.code || "SERVER", message: c.message });
            }
          },
          /** Phase 3: remember the UI anchor the chat was opened from (floating window). */
          setAnchorContext: (o) => i(() => ({ anchorContext: o || null })),
          setCurrentNode: (o) => i((a) => ({ ui: { ...a.ui, currentNode: o } })),
          setLoading: (o) => i((a) => ({ ui: { ...a.ui, loading: o } })),
          setError: (o) => {
            i((a) => ({ ui: { ...a.ui, error: o, loading: !1, currentNode: null } })), Gr("onError", o);
          },
          clearError: () => i((o) => ({ ui: { ...o.ui, error: null } })),
          toggleDraftPanel: () => i((o) => ({ ui: { ...o.ui, draftPanelOpen: !o.ui.draftPanelOpen } }))
        }
      }),
      {
        // Store-scoped key: each storeId keeps its OWN session id (the 'assistant'
        // window and the Home 'default' chat must not clobber each other's thread).
        name: e === "default" ? "fdv2-chat" : `fdv2-chat-${e}`,
        storage: ts(() => sessionStorage),
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
const cn = /* @__PURE__ */ new Map();
function rs(e = "default") {
  return cn.has(e) || cn.set(e, _a(e)), cn.get(e);
}
const is = rs("default"), ss = Jn(null);
function Fa({ storeId: e = "default", children: t }) {
  const n = xt(() => rs(e), [e]);
  return Ui(ss.Provider, { value: n }, t);
}
function Je() {
  return Yn(ss) || is;
}
const os = () => Je()((e) => e.messages), as = () => Je()(Xn((e) => e.session)), Ma = () => Je()(Xn((e) => e.draft)), za = () => Je()((e) => e.schema), we = () => Je()(Xn((e) => e.ui)), Pe = () => Je()((e) => e.actions), Yt = "fdv2-ai-prefs", Fn = "fdv2:aiPrefsChanged", fn = { language: "en", voice: null };
function ja() {
  try {
    return typeof localStorage < "u" && localStorage.getItem(Yt) != null;
  } catch {
    return !1;
  }
}
function $t() {
  try {
    const e = typeof localStorage < "u" ? localStorage.getItem(Yt) : null;
    return e ? { ...fn, ...JSON.parse(e) } : { ...fn };
  } catch {
    return { ...fn };
  }
}
function ls(e) {
  const t = { ...$t(), ...e || {} };
  try {
    localStorage.setItem(Yt, JSON.stringify(t));
  } catch {
  }
  try {
    window.dispatchEvent(new CustomEvent(Fn, { detail: t }));
  } catch {
  }
  return t;
}
function er() {
  const [e, t] = re($t);
  ne(() => {
    const r = (s) => t(s.detail || $t()), i = (s) => {
      s.key === Yt && t($t());
    };
    return window.addEventListener(Fn, r), window.addEventListener("storage", i), () => {
      window.removeEventListener(Fn, r), window.removeEventListener("storage", i);
    };
  }, []);
  const n = Ee((r) => ls(r), []);
  return [e, n];
}
function $a(e, t) {
  const n = {};
  return (e[e.length - 1] === "" ? [...e, ""] : e).join(
    (n.padRight ? " " : "") + "," + (n.padLeft === !1 ? "" : " ")
  ).trim();
}
const Ba = /^[$_\p{ID_Start}][$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, Va = /^[$_\p{ID_Start}][-$_\u{200C}\u{200D}\p{ID_Continue}]*$/u, Ha = {};
function Yr(e, t) {
  return (Ha.jsx ? Va : Ba).test(e);
}
const Ua = /[ \t\n\f\r]/g;
function qa(e) {
  return typeof e == "object" ? e.type === "text" ? Qr(e.value) : !1 : Qr(e);
}
function Qr(e) {
  return e.replace(Ua, "") === "";
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
function us(e, t) {
  const n = {}, r = {};
  for (const i of e)
    Object.assign(n, i.property), Object.assign(r, i.normal);
  return new Tt(n, r, t);
}
function Mn(e) {
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
let Ka = 0;
const B = Ye(), ie = Ye(), zn = Ye(), T = Ye(), Y = Ye(), Ue = Ye(), ye = Ye();
function Ye() {
  return 2 ** ++Ka;
}
const jn = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  boolean: B,
  booleanish: ie,
  commaOrSpaceSeparated: ye,
  commaSeparated: Ue,
  number: T,
  overloadedBoolean: zn,
  spaceSeparated: Y
}, Symbol.toStringTag, { value: "Module" })), dn = (
  /** @type {ReadonlyArray<keyof typeof types>} */
  Object.keys(jn)
);
class tr extends ge {
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
    if (super(t, n), Xr(this, "space", i), typeof r == "number")
      for (; ++s < dn.length; ) {
        const o = dn[s];
        Xr(this, dn[s], (r & jn[o]) === jn[o]);
      }
  }
}
tr.prototype.defined = !0;
function Xr(e, t, n) {
  n && (e[t] = n);
}
function at(e) {
  const t = {}, n = {};
  for (const [r, i] of Object.entries(e.properties)) {
    const s = new tr(
      r,
      e.transform(e.attributes || {}, r),
      i,
      e.space
    );
    e.mustUseProperty && e.mustUseProperty.includes(r) && (s.mustUseProperty = !0), t[r] = s, n[Mn(r)] = r, n[Mn(s.attribute)] = r;
  }
  return new Tt(t, n, e.space);
}
const cs = at({
  properties: {
    ariaActiveDescendant: null,
    ariaAtomic: ie,
    ariaAutoComplete: null,
    ariaBusy: ie,
    ariaChecked: ie,
    ariaColCount: T,
    ariaColIndex: T,
    ariaColSpan: T,
    ariaControls: Y,
    ariaCurrent: null,
    ariaDescribedBy: Y,
    ariaDetails: null,
    ariaDisabled: ie,
    ariaDropEffect: Y,
    ariaErrorMessage: null,
    ariaExpanded: ie,
    ariaFlowTo: Y,
    ariaGrabbed: ie,
    ariaHasPopup: null,
    ariaHidden: ie,
    ariaInvalid: null,
    ariaKeyShortcuts: null,
    ariaLabel: null,
    ariaLabelledBy: Y,
    ariaLevel: T,
    ariaLive: null,
    ariaModal: ie,
    ariaMultiLine: ie,
    ariaMultiSelectable: ie,
    ariaOrientation: null,
    ariaOwns: Y,
    ariaPlaceholder: null,
    ariaPosInSet: T,
    ariaPressed: ie,
    ariaReadOnly: ie,
    ariaRelevant: null,
    ariaRequired: ie,
    ariaRoleDescription: Y,
    ariaRowCount: T,
    ariaRowIndex: T,
    ariaRowSpan: T,
    ariaSelected: ie,
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
function fs(e, t) {
  return t in e ? e[t] : t;
}
function ds(e, t) {
  return fs(e, t.toLowerCase());
}
const Wa = at({
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
    allowFullScreen: B,
    allowPaymentRequest: B,
    allowUserMedia: B,
    alpha: B,
    alt: null,
    as: null,
    async: B,
    autoCapitalize: null,
    autoComplete: Y,
    autoFocus: B,
    autoPlay: B,
    blocking: Y,
    capture: null,
    charSet: null,
    checked: B,
    cite: null,
    className: Y,
    closedBy: null,
    colorSpace: null,
    cols: T,
    colSpan: T,
    command: null,
    commandFor: null,
    content: null,
    contentEditable: ie,
    controls: B,
    controlsList: Y,
    coords: T | Ue,
    crossOrigin: null,
    data: null,
    dateTime: null,
    decoding: null,
    default: B,
    defer: B,
    dir: null,
    dirName: null,
    disabled: B,
    download: zn,
    draggable: ie,
    encType: null,
    enterKeyHint: null,
    fetchPriority: null,
    form: null,
    formAction: null,
    formEncType: null,
    formMethod: null,
    formNoValidate: B,
    formTarget: null,
    headers: Y,
    height: T,
    hidden: zn,
    high: T,
    href: null,
    hrefLang: null,
    htmlFor: Y,
    httpEquiv: Y,
    id: null,
    imageSizes: null,
    imageSrcSet: null,
    inert: B,
    inputMode: null,
    integrity: null,
    is: null,
    isMap: B,
    itemId: null,
    itemProp: Y,
    itemRef: Y,
    itemScope: B,
    itemType: Y,
    kind: null,
    label: null,
    lang: null,
    language: null,
    list: null,
    loading: null,
    loop: B,
    low: T,
    manifest: null,
    max: null,
    maxLength: T,
    media: null,
    method: null,
    min: null,
    minLength: T,
    multiple: B,
    muted: B,
    name: null,
    nonce: null,
    noModule: B,
    noValidate: B,
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
    open: B,
    optimum: T,
    pattern: null,
    ping: Y,
    placeholder: null,
    playsInline: B,
    popover: null,
    popoverTarget: null,
    popoverTargetAction: null,
    poster: null,
    preload: null,
    readOnly: B,
    referrerPolicy: null,
    rel: Y,
    required: B,
    reversed: B,
    rows: T,
    rowSpan: T,
    sandbox: Y,
    scope: null,
    scoped: B,
    seamless: B,
    selected: B,
    shadowRootClonable: B,
    shadowRootCustomElementRegistry: B,
    shadowRootDelegatesFocus: B,
    shadowRootMode: null,
    shadowRootSerializable: B,
    shape: null,
    size: T,
    sizes: null,
    slot: null,
    span: T,
    spellCheck: ie,
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
    typeMustMatch: B,
    useMap: null,
    value: ie,
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
    compact: B,
    // Lists. Use CSS to reduce space between items instead
    declare: B,
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
    noResize: B,
    // `<frame>`
    noHref: B,
    // `<area>`. Use no href instead of an explicit `nohref`
    noShade: B,
    // `<hr>`. Use background-color and height instead of borders
    noWrap: B,
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
    scrolling: ie,
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
    credentialless: B,
    disablePictureInPicture: B,
    disableRemotePlayback: B,
    exportParts: Ue,
    part: Y,
    prefix: null,
    property: null,
    results: T,
    security: null,
    unselectable: null
  },
  space: "html",
  transform: ds
}), Ga = at({
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
    download: B,
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
  transform: fs
}), hs = at({
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
}), ps = at({
  attributes: { xmlnsxlink: "xmlns:xlink" },
  properties: { xmlnsXLink: null, xmlns: null },
  space: "xmlns",
  transform: ds
}), gs = at({
  properties: { xmlBase: null, xmlLang: null, xmlSpace: null },
  space: "xml",
  transform(e, t) {
    return "xml:" + t.slice(3).toLowerCase();
  }
}), Ja = {
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
}, Ya = /[A-Z]/g, Zr = /-[a-z]/g, Qa = /^data[-\w.:]+$/i;
function Xa(e, t) {
  const n = Mn(t);
  let r = t, i = ge;
  if (n in e.normal)
    return e.property[e.normal[n]];
  if (n.length > 4 && n.slice(0, 4) === "data" && Qa.test(t)) {
    if (t.charAt(4) === "-") {
      const s = t.slice(5).replace(Zr, el);
      r = "data" + s.charAt(0).toUpperCase() + s.slice(1);
    } else {
      const s = t.slice(4);
      if (!Zr.test(s)) {
        let o = s.replace(Ya, Za);
        o.charAt(0) !== "-" && (o = "-" + o), t = "data" + o;
      }
    }
    i = tr;
  }
  return new i(r, t);
}
function Za(e) {
  return "-" + e.toLowerCase();
}
function el(e) {
  return e.charAt(1).toUpperCase();
}
const tl = us([cs, Wa, hs, ps, gs], "html"), nr = us([cs, Ga, hs, ps, gs], "svg");
function nl(e) {
  return e.join(" ").trim();
}
var tt = {}, hn, ei;
function rl() {
  if (ei) return hn;
  ei = 1;
  var e = /\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, t = /\n/g, n = /^\s*/, r = /^(\*?[-#/*\\\w]+(\[[0-9a-z_-]+\])?)\s*/, i = /^:\s*/, s = /^((?:'(?:\\'|.)*?'|"(?:\\"|.)*?"|\([^)]*?\)|[^};])+)/, o = /^[;\s]*/, a = /^\s+|\s+$/g, u = `
`, l = "/", c = "*", f = "", h = "comment", d = "declaration";
  function p(v, k) {
    if (typeof v != "string")
      throw new TypeError("First argument must be a string");
    if (!v) return [];
    k = k || {};
    var C = 1, S = 1;
    function E(_) {
      var O = _.match(t);
      O && (C += O.length);
      var V = _.lastIndexOf(u);
      S = ~V ? _.length - V : S + _.length;
    }
    function L() {
      var _ = { line: C, column: S };
      return function(O) {
        return O.position = new x(_), F(), O;
      };
    }
    function x(_) {
      this.start = _, this.end = { line: C, column: S }, this.source = k.source;
    }
    x.prototype.content = v;
    function R(_) {
      var O = new Error(
        k.source + ":" + C + ":" + S + ": " + _
      );
      if (O.reason = _, O.filename = k.source, O.line = C, O.column = S, O.source = v, !k.silent) throw O;
    }
    function j(_) {
      var O = _.exec(v);
      if (O) {
        var V = O[0];
        return E(V), v = v.slice(V.length), O;
      }
    }
    function F() {
      j(n);
    }
    function w(_) {
      var O;
      for (_ = _ || []; O = A(); )
        O !== !1 && _.push(O);
      return _;
    }
    function A() {
      var _ = L();
      if (!(l != v.charAt(0) || c != v.charAt(1))) {
        for (var O = 2; f != v.charAt(O) && (c != v.charAt(O) || l != v.charAt(O + 1)); )
          ++O;
        if (O += 2, f === v.charAt(O - 1))
          return R("End of comment missing");
        var V = v.slice(2, O - 2);
        return S += 2, E(V), v = v.slice(O), S += 2, _({
          type: h,
          comment: V
        });
      }
    }
    function D() {
      var _ = L(), O = j(r);
      if (O) {
        if (A(), !j(i)) return R("property missing ':'");
        var V = j(s), W = _({
          type: d,
          property: m(O[0].replace(e, f)),
          value: V ? m(V[0].replace(e, f)) : f
        });
        return j(o), W;
      }
    }
    function M() {
      var _ = [];
      w(_);
      for (var O; O = D(); )
        O !== !1 && (_.push(O), w(_));
      return _;
    }
    return F(), M();
  }
  function m(v) {
    return v ? v.replace(a, f) : f;
  }
  return hn = p, hn;
}
var ti;
function il() {
  if (ti) return tt;
  ti = 1;
  var e = tt && tt.__importDefault || function(r) {
    return r && r.__esModule ? r : { default: r };
  };
  Object.defineProperty(tt, "__esModule", { value: !0 }), tt.default = n;
  const t = e(rl());
  function n(r, i) {
    let s = null;
    if (!r || typeof r != "string")
      return s;
    const o = (0, t.default)(r), a = typeof i == "function";
    return o.forEach((u) => {
      if (u.type !== "declaration")
        return;
      const { property: l, value: c } = u;
      a ? i(l, c, u) : c && (s = s || {}, s[l] = c);
    }), s;
  }
  return tt;
}
var gt = {}, ni;
function sl() {
  if (ni) return gt;
  ni = 1, Object.defineProperty(gt, "__esModule", { value: !0 }), gt.camelCase = void 0;
  var e = /^--[a-zA-Z0-9_-]+$/, t = /-([a-z])/g, n = /^[^-]+$/, r = /^-(webkit|moz|ms|o|khtml)-/, i = /^-(ms)-/, s = function(l) {
    return !l || n.test(l) || e.test(l);
  }, o = function(l, c) {
    return c.toUpperCase();
  }, a = function(l, c) {
    return "".concat(c, "-");
  }, u = function(l, c) {
    return c === void 0 && (c = {}), s(l) ? l : (l = l.toLowerCase(), c.reactCompat ? l = l.replace(i, a) : l = l.replace(r, a), l.replace(t, o));
  };
  return gt.camelCase = u, gt;
}
var mt, ri;
function ol() {
  if (ri) return mt;
  ri = 1;
  var e = mt && mt.__importDefault || function(i) {
    return i && i.__esModule ? i : { default: i };
  }, t = e(il()), n = sl();
  function r(i, s) {
    var o = {};
    return !i || typeof i != "string" || (0, t.default)(i, function(a, u) {
      a && u && (o[(0, n.camelCase)(a, s)] = u);
    }), o;
  }
  return r.default = r, mt = r, mt;
}
var al = ol();
const ll = /* @__PURE__ */ Ji(al), ms = ys("end"), rr = ys("start");
function ys(e) {
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
function ul(e) {
  const t = rr(e), n = ms(e);
  if (t && n)
    return { start: t, end: n };
}
function wt(e) {
  return !e || typeof e != "object" ? "" : "position" in e || "type" in e ? ii(e.position) : "start" in e || "end" in e ? ii(e) : "line" in e || "column" in e ? $n(e) : "";
}
function $n(e) {
  return si(e && e.line) + ":" + si(e && e.column);
}
function ii(e) {
  return $n(e && e.start) + "-" + $n(e && e.end);
}
function si(e) {
  return e && typeof e == "number" ? e : 1;
}
class ce extends Error {
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
ce.prototype.file = "";
ce.prototype.name = "";
ce.prototype.reason = "";
ce.prototype.message = "";
ce.prototype.stack = "";
ce.prototype.column = void 0;
ce.prototype.line = void 0;
ce.prototype.ancestors = void 0;
ce.prototype.cause = void 0;
ce.prototype.fatal = void 0;
ce.prototype.place = void 0;
ce.prototype.ruleId = void 0;
ce.prototype.source = void 0;
const ir = {}.hasOwnProperty, cl = /* @__PURE__ */ new Map(), fl = /[A-Z]/g, dl = /* @__PURE__ */ new Set(["table", "tbody", "thead", "tfoot", "tr"]), hl = /* @__PURE__ */ new Set(["td", "th"]), bs = "https://github.com/syntax-tree/hast-util-to-jsx-runtime";
function pl(e, t) {
  if (!t || t.Fragment === void 0)
    throw new TypeError("Expected `Fragment` in options");
  const n = t.filePath || void 0;
  let r;
  if (t.development) {
    if (typeof t.jsxDEV != "function")
      throw new TypeError(
        "Expected `jsxDEV` in options when `development: true`"
      );
    r = wl(n, t.jsxDEV);
  } else {
    if (typeof t.jsx != "function")
      throw new TypeError("Expected `jsx` in production options");
    if (typeof t.jsxs != "function")
      throw new TypeError("Expected `jsxs` in production options");
    r = vl(n, t.jsx, t.jsxs);
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
    schema: t.space === "svg" ? nr : tl,
    stylePropertyNameCase: t.stylePropertyNameCase || "dom",
    tableCellAlignToStyle: t.tableCellAlignToStyle !== !1
  }, s = xs(i, e, void 0);
  return s && typeof s != "string" ? s : i.create(
    e,
    i.Fragment,
    { children: s || void 0 },
    void 0
  );
}
function xs(e, t, n) {
  if (t.type === "element")
    return gl(e, t, n);
  if (t.type === "mdxFlowExpression" || t.type === "mdxTextExpression")
    return ml(e, t);
  if (t.type === "mdxJsxFlowElement" || t.type === "mdxJsxTextElement")
    return bl(e, t, n);
  if (t.type === "mdxjsEsm")
    return yl(e, t);
  if (t.type === "root")
    return xl(e, t, n);
  if (t.type === "text")
    return kl(e, t);
}
function gl(e, t, n) {
  const r = e.schema;
  let i = r;
  t.tagName.toLowerCase() === "svg" && r.space === "html" && (i = nr, e.schema = i), e.ancestors.push(t);
  const s = vs(e, t.tagName, !1), o = Sl(e, t);
  let a = or(e, t);
  return dl.has(t.tagName) && (a = a.filter(function(u) {
    return typeof u == "string" ? !qa(u) : !0;
  })), ks(e, o, s, t), sr(o, a), e.ancestors.pop(), e.schema = r, e.create(t, s, o, n);
}
function ml(e, t) {
  if (t.data && t.data.estree && e.evaluater) {
    const r = t.data.estree.body[0];
    return r.type, /** @type {Child | undefined} */
    e.evaluater.evaluateExpression(r.expression);
  }
  It(e, t.position);
}
function yl(e, t) {
  if (t.data && t.data.estree && e.evaluater)
    return (
      /** @type {Child | undefined} */
      e.evaluater.evaluateProgram(t.data.estree)
    );
  It(e, t.position);
}
function bl(e, t, n) {
  const r = e.schema;
  let i = r;
  t.name === "svg" && r.space === "html" && (i = nr, e.schema = i), e.ancestors.push(t);
  const s = t.name === null ? e.Fragment : vs(e, t.name, !0), o = Cl(e, t), a = or(e, t);
  return ks(e, o, s, t), sr(o, a), e.ancestors.pop(), e.schema = r, e.create(t, s, o, n);
}
function xl(e, t, n) {
  const r = {};
  return sr(r, or(e, t)), e.create(t, e.Fragment, r, n);
}
function kl(e, t) {
  return t.value;
}
function ks(e, t, n, r) {
  typeof n != "string" && n !== e.Fragment && e.passNode && (t.node = r);
}
function sr(e, t) {
  if (t.length > 0) {
    const n = t.length > 1 ? t : t[0];
    n && (e.children = n);
  }
}
function vl(e, t, n) {
  return r;
  function r(i, s, o, a) {
    const l = Array.isArray(o.children) ? n : t;
    return a ? l(s, o, a) : l(s, o);
  }
}
function wl(e, t) {
  return n;
  function n(r, i, s, o) {
    const a = Array.isArray(s.children), u = rr(r);
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
function Sl(e, t) {
  const n = {};
  let r, i;
  for (i in t.properties)
    if (i !== "children" && ir.call(t.properties, i)) {
      const s = El(e, i, t.properties[i]);
      if (s) {
        const [o, a] = s;
        e.tableCellAlignToStyle && o === "align" && typeof a == "string" && hl.has(t.tagName) ? r = a : n[o] = a;
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
function Cl(e, t) {
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
        It(e, t.position);
    else {
      const i = r.name;
      let s;
      if (r.value && typeof r.value == "object")
        if (r.value.data && r.value.data.estree && e.evaluater) {
          const a = r.value.data.estree.body[0];
          a.type, s = e.evaluater.evaluateExpression(a.expression);
        } else
          It(e, t.position);
      else
        s = r.value === null ? !0 : r.value;
      n[i] = /** @type {Props[keyof Props]} */
      s;
    }
  return n;
}
function or(e, t) {
  const n = [];
  let r = -1;
  const i = e.passKeys ? /* @__PURE__ */ new Map() : cl;
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
    const a = xs(e, s, o);
    a !== void 0 && n.push(a);
  }
  return n;
}
function El(e, t, n) {
  const r = Xa(e.schema, t);
  if (!(n == null || typeof n == "number" && Number.isNaN(n))) {
    if (Array.isArray(n) && (n = r.commaSeparated ? $a(n) : nl(n)), r.property === "style") {
      let i = typeof n == "object" ? n : Il(e, String(n));
      return e.stylePropertyNameCase === "css" && (i = Nl(i)), ["style", i];
    }
    return [
      e.elementAttributeNameCase === "react" && r.space ? Ja[r.property] || r.property : r.attribute,
      n
    ];
  }
}
function Il(e, t) {
  try {
    return ll(t, { reactCompat: !0 });
  } catch (n) {
    if (e.ignoreInvalidStyle)
      return {};
    const r = (
      /** @type {Error} */
      n
    ), i = new ce("Cannot parse `style` attribute", {
      ancestors: e.ancestors,
      cause: r,
      ruleId: "style",
      source: "hast-util-to-jsx-runtime"
    });
    throw i.file = e.filePath || void 0, i.url = bs + "#cannot-parse-style-attribute", i;
  }
}
function vs(e, t, n) {
  let r;
  if (!n)
    r = { type: "Literal", value: t };
  else if (t.includes(".")) {
    const i = t.split(".");
    let s = -1, o;
    for (; ++s < i.length; ) {
      const a = Yr(i[s]) ? { type: "Identifier", name: i[s] } : { type: "Literal", value: i[s] };
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
    r = Yr(t) && !/^[a-z]/.test(t) ? { type: "Identifier", name: t } : { type: "Literal", value: t };
  if (r.type === "Literal") {
    const i = (
      /** @type {string | number} */
      r.value
    );
    return ir.call(e.components, i) ? e.components[i] : i;
  }
  if (e.evaluater)
    return e.evaluater.evaluateExpression(r);
  It(e);
}
function It(e, t) {
  const n = new ce(
    "Cannot handle MDX estrees without `createEvaluater`",
    {
      ancestors: e.ancestors,
      place: t,
      ruleId: "mdx-estree",
      source: "hast-util-to-jsx-runtime"
    }
  );
  throw n.file = e.filePath || void 0, n.url = bs + "#cannot-handle-mdx-estrees-without-createevaluater", n;
}
function Nl(e) {
  const t = {};
  let n;
  for (n in e)
    ir.call(e, n) && (t[Tl(n)] = e[n]);
  return t;
}
function Tl(e) {
  let t = e.replace(fl, Ll);
  return t.slice(0, 3) === "ms-" && (t = "-" + t), t;
}
function Ll(e) {
  return "-" + e.toLowerCase();
}
const pn = {
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
}, Al = {};
function ar(e, t) {
  const n = Al, r = typeof n.includeImageAlt == "boolean" ? n.includeImageAlt : !0, i = typeof n.includeHtml == "boolean" ? n.includeHtml : !0;
  return ws(e, r, i);
}
function ws(e, t, n) {
  if (Rl(e)) {
    if ("value" in e)
      return e.type === "html" && !n ? "" : e.value;
    if (t && "alt" in e && e.alt)
      return e.alt;
    if ("children" in e)
      return oi(e.children, t, n);
  }
  return Array.isArray(e) ? oi(e, t, n) : "";
}
function oi(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; )
    r[i] = ws(e[i], t, n);
  return r.join("");
}
function Rl(e) {
  return !!(e && typeof e == "object");
}
const ai = document.createElement("i");
function lr(e) {
  const t = "&" + e + ";";
  ai.innerHTML = t;
  const n = ai.textContent;
  return n.charCodeAt(n.length - 1) === 59 && e !== "semi" || n === t ? !1 : n;
}
function xe(e, t, n, r) {
  const i = e.length;
  let s = 0, o;
  if (t < 0 ? t = -t > i ? 0 : i + t : t = t > i ? i : t, n = n > 0 ? n : 0, r.length < 1e4)
    o = Array.from(r), o.unshift(t, n), e.splice(...o);
  else
    for (n && e.splice(t, n); s < r.length; )
      o = r.slice(s, s + 1e4), o.unshift(t, 0), e.splice(...o), s += 1e4, t += 1e4;
}
function ke(e, t) {
  return e.length > 0 ? (xe(e, e.length, 0, t), e) : t;
}
const li = {}.hasOwnProperty;
function Ss(e) {
  const t = {};
  let n = -1;
  for (; ++n < e.length; )
    Ol(t, e[n]);
  return t;
}
function Ol(e, t) {
  let n;
  for (n in t) {
    const i = (li.call(e, n) ? e[n] : void 0) || (e[n] = {}), s = t[n];
    let o;
    if (s)
      for (o in s) {
        li.call(i, o) || (i[o] = []);
        const a = s[o];
        Pl(
          // @ts-expect-error Looks like a list.
          i[o],
          Array.isArray(a) ? a : a ? [a] : []
        );
      }
  }
}
function Pl(e, t) {
  let n = -1;
  const r = [];
  for (; ++n < t.length; )
    (t[n].add === "after" ? e : r).push(t[n]);
  xe(e, 0, 0, r);
}
function Cs(e, t) {
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
function Ie(e) {
  return e.replace(/[\t\n\r ]+/g, " ").replace(/^ | $/g, "").toLowerCase().toUpperCase();
}
const fe = je(/[A-Za-z]/), ue = je(/[\dA-Za-z]/), Dl = je(/[#-'*+\--9=?A-Z^-~]/);
function qt(e) {
  return (
    // Special whitespace codes (which have negative values), C0 and Control
    // character DEL
    e !== null && (e < 32 || e === 127)
  );
}
const Bn = je(/\d/), _l = je(/[\dA-Fa-f]/), Fl = je(/[!-/:-@[-`{-~]/);
function z(e) {
  return e !== null && e < -2;
}
function X(e) {
  return e !== null && (e < 0 || e === 32);
}
function U(e) {
  return e === -2 || e === -1 || e === 32;
}
const Qt = je(/\p{P}|\p{S}/u), We = je(/\s/);
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
    if (s === 37 && ue(e.charCodeAt(n + 1)) && ue(e.charCodeAt(n + 2)))
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
const Ml = {
  tokenize: zl
};
function zl(e) {
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
    return z(a) ? (e.consume(a), e.exit("chunkText"), s) : (e.consume(a), o);
  }
}
const jl = {
  tokenize: $l
}, ui = {
  tokenize: Bl
};
function $l(e) {
  const t = this, n = [];
  let r = 0, i, s, o;
  return a;
  function a(S) {
    if (r < n.length) {
      const E = n[r];
      return t.containerState = E[1], e.attempt(E[0].continuation, u, l)(S);
    }
    return l(S);
  }
  function u(S) {
    if (r++, t.containerState._closeFlow) {
      t.containerState._closeFlow = void 0, i && C();
      const E = t.events.length;
      let L = E, x;
      for (; L--; )
        if (t.events[L][0] === "exit" && t.events[L][1].type === "chunkFlow") {
          x = t.events[L][1].end;
          break;
        }
      k(r);
      let R = E;
      for (; R < t.events.length; )
        t.events[R][1].end = {
          ...x
        }, R++;
      return xe(t.events, L + 1, 0, t.events.slice(E)), t.events.length = R, l(S);
    }
    return a(S);
  }
  function l(S) {
    if (r === n.length) {
      if (!i)
        return h(S);
      if (i.currentConstruct && i.currentConstruct.concrete)
        return p(S);
      t.interrupt = !!(i.currentConstruct && !i._gfmTableDynamicInterruptHack);
    }
    return t.containerState = {}, e.check(ui, c, f)(S);
  }
  function c(S) {
    return i && C(), k(r), h(S);
  }
  function f(S) {
    return t.parser.lazy[t.now().line] = r !== n.length, o = t.now().offset, p(S);
  }
  function h(S) {
    return t.containerState = {}, e.attempt(ui, d, p)(S);
  }
  function d(S) {
    return r++, n.push([t.currentConstruct, t.containerState]), h(S);
  }
  function p(S) {
    if (S === null) {
      i && C(), k(0), e.consume(S);
      return;
    }
    return i = i || t.parser.flow(t.now()), e.enter("chunkFlow", {
      _tokenizer: i,
      contentType: "flow",
      previous: s
    }), m(S);
  }
  function m(S) {
    if (S === null) {
      v(e.exit("chunkFlow"), !0), k(0), e.consume(S);
      return;
    }
    return z(S) ? (e.consume(S), v(e.exit("chunkFlow")), r = 0, t.interrupt = void 0, a) : (e.consume(S), m);
  }
  function v(S, E) {
    const L = t.sliceStream(S);
    if (E && L.push(null), S.previous = s, s && (s.next = S), s = S, i.defineSkip(S.start), i.write(L), t.parser.lazy[S.start.line]) {
      let x = i.events.length;
      for (; x--; )
        if (
          // The token starts before the line ending…
          i.events[x][1].start.offset < o && // …and either is not ended yet…
          (!i.events[x][1].end || // …or ends after it.
          i.events[x][1].end.offset > o)
        )
          return;
      const R = t.events.length;
      let j = R, F, w;
      for (; j--; )
        if (t.events[j][0] === "exit" && t.events[j][1].type === "chunkFlow") {
          if (F) {
            w = t.events[j][1].end;
            break;
          }
          F = !0;
        }
      for (k(r), x = R; x < t.events.length; )
        t.events[x][1].end = {
          ...w
        }, x++;
      xe(t.events, j + 1, 0, t.events.slice(R)), t.events.length = x;
    }
  }
  function k(S) {
    let E = n.length;
    for (; E-- > S; ) {
      const L = n[E];
      t.containerState = L[1], L[0].exit.call(t, e);
    }
    n.length = S;
  }
  function C() {
    i.write([null]), s = void 0, i = void 0, t.containerState._closeFlow = void 0;
  }
}
function Bl(e, t, n) {
  return K(e, e.attempt(this.parser.constructs.document, t, n), "linePrefix", this.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4);
}
function st(e) {
  if (e === null || X(e) || We(e))
    return 1;
  if (Qt(e))
    return 2;
}
function Xt(e, t, n) {
  const r = [];
  let i = -1;
  for (; ++i < e.length; ) {
    const s = e[i].resolveAll;
    s && !r.includes(s) && (t = s(t, n), r.push(s));
  }
  return t;
}
const Vn = {
  name: "attention",
  resolveAll: Vl,
  tokenize: Hl
};
function Vl(e, t) {
  let n = -1, r, i, s, o, a, u, l, c;
  for (; ++n < e.length; )
    if (e[n][0] === "enter" && e[n][1].type === "attentionSequence" && e[n][1]._close) {
      for (r = n; r--; )
        if (e[r][0] === "exit" && e[r][1].type === "attentionSequence" && e[r][1]._open && // If the markers are the same:
        t.sliceSerialize(e[r][1]).charCodeAt(0) === t.sliceSerialize(e[n][1]).charCodeAt(0)) {
          if ((e[r][1]._close || e[n][1]._open) && (e[n][1].end.offset - e[n][1].start.offset) % 3 && !((e[r][1].end.offset - e[r][1].start.offset + e[n][1].end.offset - e[n][1].start.offset) % 3))
            continue;
          u = e[r][1].end.offset - e[r][1].start.offset > 1 && e[n][1].end.offset - e[n][1].start.offset > 1 ? 2 : 1;
          const f = {
            ...e[r][1].end
          }, h = {
            ...e[n][1].start
          };
          ci(f, -u), ci(h, u), o = {
            type: u > 1 ? "strongSequence" : "emphasisSequence",
            start: f,
            end: {
              ...e[r][1].end
            }
          }, a = {
            type: u > 1 ? "strongSequence" : "emphasisSequence",
            start: {
              ...e[n][1].start
            },
            end: h
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
          }, l = [], e[r][1].end.offset - e[r][1].start.offset && (l = ke(l, [["enter", e[r][1], t], ["exit", e[r][1], t]])), l = ke(l, [["enter", i, t], ["enter", o, t], ["exit", o, t], ["enter", s, t]]), l = ke(l, Xt(t.parser.constructs.insideSpan.null, e.slice(r + 1, n), t)), l = ke(l, [["exit", s, t], ["enter", a, t], ["exit", a, t], ["exit", i, t]]), e[n][1].end.offset - e[n][1].start.offset ? (c = 2, l = ke(l, [["enter", e[n][1], t], ["exit", e[n][1], t]])) : c = 0, xe(e, r - 1, n - r + 3, l), n = r + l.length - c - 2;
          break;
        }
    }
  for (n = -1; ++n < e.length; )
    e[n][1].type === "attentionSequence" && (e[n][1].type = "data");
  return e;
}
function Hl(e, t) {
  const n = this.parser.constructs.attentionMarkers.null, r = this.previous, i = st(r);
  let s;
  return o;
  function o(u) {
    return s = u, e.enter("attentionSequence"), a(u);
  }
  function a(u) {
    if (u === s)
      return e.consume(u), a;
    const l = e.exit("attentionSequence"), c = st(u), f = !c || c === 2 && i || n.includes(u), h = !i || i === 2 && c || n.includes(r);
    return l._open = !!(s === 42 ? f : f && (i || !h)), l._close = !!(s === 42 ? h : h && (c || !f)), t(u);
  }
}
function ci(e, t) {
  e.column += t, e.offset += t, e._bufferIndex += t;
}
const Ul = {
  name: "autolink",
  tokenize: ql
};
function ql(e, t, n) {
  let r = 0;
  return i;
  function i(d) {
    return e.enter("autolink"), e.enter("autolinkMarker"), e.consume(d), e.exit("autolinkMarker"), e.enter("autolinkProtocol"), s;
  }
  function s(d) {
    return fe(d) ? (e.consume(d), o) : d === 64 ? n(d) : l(d);
  }
  function o(d) {
    return d === 43 || d === 45 || d === 46 || ue(d) ? (r = 1, a(d)) : l(d);
  }
  function a(d) {
    return d === 58 ? (e.consume(d), r = 0, u) : (d === 43 || d === 45 || d === 46 || ue(d)) && r++ < 32 ? (e.consume(d), a) : (r = 0, l(d));
  }
  function u(d) {
    return d === 62 ? (e.exit("autolinkProtocol"), e.enter("autolinkMarker"), e.consume(d), e.exit("autolinkMarker"), e.exit("autolink"), t) : d === null || d === 32 || d === 60 || qt(d) ? n(d) : (e.consume(d), u);
  }
  function l(d) {
    return d === 64 ? (e.consume(d), c) : Dl(d) ? (e.consume(d), l) : n(d);
  }
  function c(d) {
    return ue(d) ? f(d) : n(d);
  }
  function f(d) {
    return d === 46 ? (e.consume(d), r = 0, c) : d === 62 ? (e.exit("autolinkProtocol").type = "autolinkEmail", e.enter("autolinkMarker"), e.consume(d), e.exit("autolinkMarker"), e.exit("autolink"), t) : h(d);
  }
  function h(d) {
    if ((d === 45 || ue(d)) && r++ < 63) {
      const p = d === 45 ? h : f;
      return e.consume(d), p;
    }
    return n(d);
  }
}
const Lt = {
  partial: !0,
  tokenize: Kl
};
function Kl(e, t, n) {
  return r;
  function r(s) {
    return U(s) ? K(e, i, "linePrefix")(s) : i(s);
  }
  function i(s) {
    return s === null || z(s) ? t(s) : n(s);
  }
}
const Es = {
  continuation: {
    tokenize: Gl
  },
  exit: Jl,
  name: "blockQuote",
  tokenize: Wl
};
function Wl(e, t, n) {
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
function Gl(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return U(o) ? K(e, s, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(o) : s(o);
  }
  function s(o) {
    return e.attempt(Es, t, n)(o);
  }
}
function Jl(e) {
  e.exit("blockQuote");
}
const Is = {
  name: "characterEscape",
  tokenize: Yl
};
function Yl(e, t, n) {
  return r;
  function r(s) {
    return e.enter("characterEscape"), e.enter("escapeMarker"), e.consume(s), e.exit("escapeMarker"), i;
  }
  function i(s) {
    return Fl(s) ? (e.enter("characterEscapeValue"), e.consume(s), e.exit("characterEscapeValue"), e.exit("characterEscape"), t) : n(s);
  }
}
const Ns = {
  name: "characterReference",
  tokenize: Ql
};
function Ql(e, t, n) {
  const r = this;
  let i = 0, s, o;
  return a;
  function a(f) {
    return e.enter("characterReference"), e.enter("characterReferenceMarker"), e.consume(f), e.exit("characterReferenceMarker"), u;
  }
  function u(f) {
    return f === 35 ? (e.enter("characterReferenceMarkerNumeric"), e.consume(f), e.exit("characterReferenceMarkerNumeric"), l) : (e.enter("characterReferenceValue"), s = 31, o = ue, c(f));
  }
  function l(f) {
    return f === 88 || f === 120 ? (e.enter("characterReferenceMarkerHexadecimal"), e.consume(f), e.exit("characterReferenceMarkerHexadecimal"), e.enter("characterReferenceValue"), s = 6, o = _l, c) : (e.enter("characterReferenceValue"), s = 7, o = Bn, c(f));
  }
  function c(f) {
    if (f === 59 && i) {
      const h = e.exit("characterReferenceValue");
      return o === ue && !lr(r.sliceSerialize(h)) ? n(f) : (e.enter("characterReferenceMarker"), e.consume(f), e.exit("characterReferenceMarker"), e.exit("characterReference"), t);
    }
    return o(f) && i++ < s ? (e.consume(f), c) : n(f);
  }
}
const fi = {
  partial: !0,
  tokenize: Zl
}, di = {
  concrete: !0,
  name: "codeFenced",
  tokenize: Xl
};
function Xl(e, t, n) {
  const r = this, i = {
    partial: !0,
    tokenize: L
  };
  let s = 0, o = 0, a;
  return u;
  function u(x) {
    return l(x);
  }
  function l(x) {
    const R = r.events[r.events.length - 1];
    return s = R && R[1].type === "linePrefix" ? R[2].sliceSerialize(R[1], !0).length : 0, a = x, e.enter("codeFenced"), e.enter("codeFencedFence"), e.enter("codeFencedFenceSequence"), c(x);
  }
  function c(x) {
    return x === a ? (o++, e.consume(x), c) : o < 3 ? n(x) : (e.exit("codeFencedFenceSequence"), U(x) ? K(e, f, "whitespace")(x) : f(x));
  }
  function f(x) {
    return x === null || z(x) ? (e.exit("codeFencedFence"), r.interrupt ? t(x) : e.check(fi, m, E)(x)) : (e.enter("codeFencedFenceInfo"), e.enter("chunkString", {
      contentType: "string"
    }), h(x));
  }
  function h(x) {
    return x === null || z(x) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), f(x)) : U(x) ? (e.exit("chunkString"), e.exit("codeFencedFenceInfo"), K(e, d, "whitespace")(x)) : x === 96 && x === a ? n(x) : (e.consume(x), h);
  }
  function d(x) {
    return x === null || z(x) ? f(x) : (e.enter("codeFencedFenceMeta"), e.enter("chunkString", {
      contentType: "string"
    }), p(x));
  }
  function p(x) {
    return x === null || z(x) ? (e.exit("chunkString"), e.exit("codeFencedFenceMeta"), f(x)) : x === 96 && x === a ? n(x) : (e.consume(x), p);
  }
  function m(x) {
    return e.attempt(i, E, v)(x);
  }
  function v(x) {
    return e.enter("lineEnding"), e.consume(x), e.exit("lineEnding"), k;
  }
  function k(x) {
    return s > 0 && U(x) ? K(e, C, "linePrefix", s + 1)(x) : C(x);
  }
  function C(x) {
    return x === null || z(x) ? e.check(fi, m, E)(x) : (e.enter("codeFlowValue"), S(x));
  }
  function S(x) {
    return x === null || z(x) ? (e.exit("codeFlowValue"), C(x)) : (e.consume(x), S);
  }
  function E(x) {
    return e.exit("codeFenced"), t(x);
  }
  function L(x, R, j) {
    let F = 0;
    return w;
    function w(O) {
      return x.enter("lineEnding"), x.consume(O), x.exit("lineEnding"), A;
    }
    function A(O) {
      return x.enter("codeFencedFence"), U(O) ? K(x, D, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(O) : D(O);
    }
    function D(O) {
      return O === a ? (x.enter("codeFencedFenceSequence"), M(O)) : j(O);
    }
    function M(O) {
      return O === a ? (F++, x.consume(O), M) : F >= o ? (x.exit("codeFencedFenceSequence"), U(O) ? K(x, _, "whitespace")(O) : _(O)) : j(O);
    }
    function _(O) {
      return O === null || z(O) ? (x.exit("codeFencedFence"), R(O)) : j(O);
    }
  }
}
function Zl(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return o === null ? n(o) : (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), s);
  }
  function s(o) {
    return r.parser.lazy[r.now().line] ? n(o) : t(o);
  }
}
const gn = {
  name: "codeIndented",
  tokenize: tu
}, eu = {
  partial: !0,
  tokenize: nu
};
function tu(e, t, n) {
  const r = this;
  return i;
  function i(l) {
    return e.enter("codeIndented"), K(e, s, "linePrefix", 5)(l);
  }
  function s(l) {
    const c = r.events[r.events.length - 1];
    return c && c[1].type === "linePrefix" && c[2].sliceSerialize(c[1], !0).length >= 4 ? o(l) : n(l);
  }
  function o(l) {
    return l === null ? u(l) : z(l) ? e.attempt(eu, o, u)(l) : (e.enter("codeFlowValue"), a(l));
  }
  function a(l) {
    return l === null || z(l) ? (e.exit("codeFlowValue"), o(l)) : (e.consume(l), a);
  }
  function u(l) {
    return e.exit("codeIndented"), t(l);
  }
}
function nu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return r.parser.lazy[r.now().line] ? n(o) : z(o) ? (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), i) : K(e, s, "linePrefix", 5)(o);
  }
  function s(o) {
    const a = r.events[r.events.length - 1];
    return a && a[1].type === "linePrefix" && a[2].sliceSerialize(a[1], !0).length >= 4 ? t(o) : z(o) ? i(o) : n(o);
  }
}
const ru = {
  name: "codeText",
  previous: su,
  resolve: iu,
  tokenize: ou
};
function iu(e) {
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
function su(e) {
  return e !== 96 || this.events[this.events.length - 1][1].type === "characterEscape";
}
function ou(e, t, n) {
  let r = 0, i, s;
  return o;
  function o(f) {
    return e.enter("codeText"), e.enter("codeTextSequence"), a(f);
  }
  function a(f) {
    return f === 96 ? (e.consume(f), r++, a) : (e.exit("codeTextSequence"), u(f));
  }
  function u(f) {
    return f === null ? n(f) : f === 32 ? (e.enter("space"), e.consume(f), e.exit("space"), u) : f === 96 ? (s = e.enter("codeTextSequence"), i = 0, c(f)) : z(f) ? (e.enter("lineEnding"), e.consume(f), e.exit("lineEnding"), u) : (e.enter("codeTextData"), l(f));
  }
  function l(f) {
    return f === null || f === 32 || f === 96 || z(f) ? (e.exit("codeTextData"), u(f)) : (e.consume(f), l);
  }
  function c(f) {
    return f === 96 ? (e.consume(f), i++, c) : i === r ? (e.exit("codeTextSequence"), e.exit("codeText"), t(f)) : (s.type = "codeTextData", l(f));
  }
}
class au {
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
    return r && yt(this.left, r), s.reverse();
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
    this.setCursor(Number.POSITIVE_INFINITY), yt(this.left, t);
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
    this.setCursor(0), yt(this.right, t.reverse());
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
        yt(this.right, n.reverse());
      } else {
        const n = this.right.splice(this.left.length + this.right.length - t, Number.POSITIVE_INFINITY);
        yt(this.left, n.reverse());
      }
  }
}
function yt(e, t) {
  let n = 0;
  if (t.length < 1e4)
    e.push(...t);
  else
    for (; n < t.length; )
      e.push(...t.slice(n, n + 1e4)), n += 1e4;
}
function Ts(e) {
  const t = {};
  let n = -1, r, i, s, o, a, u, l;
  const c = new au(e);
  for (; ++n < c.length; ) {
    for (; n in t; )
      n = t[n];
    if (r = c.get(n), n && r[1].type === "chunkFlow" && c.get(n - 1)[1].type === "listItemPrefix" && (u = r[1]._tokenizer.events, s = 0, s < u.length && u[s][1].type === "lineEndingBlank" && (s += 2), s < u.length && u[s][1].type === "content"))
      for (; ++s < u.length && u[s][1].type !== "content"; )
        u[s][1].type === "chunkText" && (u[s][1]._isInFirstContentOfListItem = !0, s++);
    if (r[0] === "enter")
      r[1].contentType && (Object.assign(t, lu(c, n)), n = t[n], l = !0);
    else if (r[1]._container) {
      for (s = n, i = void 0; s--; )
        if (o = c.get(s), o[1].type === "lineEnding" || o[1].type === "lineEndingBlank")
          o[0] === "enter" && (i && (c.get(i)[1].type = "lineEndingBlank"), o[1].type = "lineEnding", i = s);
        else if (!(o[1].type === "linePrefix" || o[1].type === "listItemIndent")) break;
      i && (r[1].end = {
        ...c.get(i)[1].start
      }, a = c.slice(i, n), a.unshift(r), c.splice(i, n - i + 1, a));
    }
  }
  return xe(e, 0, Number.POSITIVE_INFINITY, c.slice(0)), !l;
}
function lu(e, t) {
  const n = e.get(t)[1], r = e.get(t)[2];
  let i = t - 1;
  const s = [];
  let o = n._tokenizer;
  o || (o = r.parser[n.contentType](n.start), n._contentTypeTextTrailing && (o._contentTypeTextTrailing = !0));
  const a = o.events, u = [], l = {};
  let c, f, h = -1, d = n, p = 0, m = 0;
  const v = [m];
  for (; d; ) {
    for (; e.get(++i)[1] !== d; )
      ;
    s.push(i), d._tokenizer || (c = r.sliceStream(d), d.next || c.push(null), f && o.defineSkip(d.start), d._isInFirstContentOfListItem && (o._gfmTasklistFirstContentOfListItem = !0), o.write(c), d._isInFirstContentOfListItem && (o._gfmTasklistFirstContentOfListItem = void 0)), f = d, d = d.next;
  }
  for (d = n; ++h < a.length; )
    // Find a void token that includes a break.
    a[h][0] === "exit" && a[h - 1][0] === "enter" && a[h][1].type === a[h - 1][1].type && a[h][1].start.line !== a[h][1].end.line && (m = h + 1, v.push(m), d._tokenizer = void 0, d.previous = void 0, d = d.next);
  for (o.events = [], d ? (d._tokenizer = void 0, d.previous = void 0) : v.pop(), h = v.length; h--; ) {
    const k = a.slice(v[h], v[h + 1]), C = s.pop();
    u.push([C, C + k.length - 1]), e.splice(C, 2, k);
  }
  for (u.reverse(), h = -1; ++h < u.length; )
    l[p + u[h][0]] = p + u[h][1], p += u[h][1] - u[h][0] - 1;
  return l;
}
const uu = {
  resolve: fu,
  tokenize: du
}, cu = {
  partial: !0,
  tokenize: hu
};
function fu(e) {
  return Ts(e), e;
}
function du(e, t) {
  let n;
  return r;
  function r(a) {
    return e.enter("content"), n = e.enter("chunkContent", {
      contentType: "content"
    }), i(a);
  }
  function i(a) {
    return a === null ? s(a) : z(a) ? e.check(cu, o, s)(a) : (e.consume(a), i);
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
function hu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return e.exit("chunkContent"), e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), K(e, s, "linePrefix");
  }
  function s(o) {
    if (o === null || z(o))
      return n(o);
    const a = r.events[r.events.length - 1];
    return !r.parser.constructs.disable.null.includes("codeIndented") && a && a[1].type === "linePrefix" && a[2].sliceSerialize(a[1], !0).length >= 4 ? t(o) : e.interrupt(r.parser.constructs.flow, n, t)(o);
  }
}
function Ls(e, t, n, r, i, s, o, a, u) {
  const l = u || Number.POSITIVE_INFINITY;
  let c = 0;
  return f;
  function f(k) {
    return k === 60 ? (e.enter(r), e.enter(i), e.enter(s), e.consume(k), e.exit(s), h) : k === null || k === 32 || k === 41 || qt(k) ? n(k) : (e.enter(r), e.enter(o), e.enter(a), e.enter("chunkString", {
      contentType: "string"
    }), m(k));
  }
  function h(k) {
    return k === 62 ? (e.enter(s), e.consume(k), e.exit(s), e.exit(i), e.exit(r), t) : (e.enter(a), e.enter("chunkString", {
      contentType: "string"
    }), d(k));
  }
  function d(k) {
    return k === 62 ? (e.exit("chunkString"), e.exit(a), h(k)) : k === null || k === 60 || z(k) ? n(k) : (e.consume(k), k === 92 ? p : d);
  }
  function p(k) {
    return k === 60 || k === 62 || k === 92 ? (e.consume(k), d) : d(k);
  }
  function m(k) {
    return !c && (k === null || k === 41 || X(k)) ? (e.exit("chunkString"), e.exit(a), e.exit(o), e.exit(r), t(k)) : c < l && k === 40 ? (e.consume(k), c++, m) : k === 41 ? (e.consume(k), c--, m) : k === null || k === 32 || k === 40 || qt(k) ? n(k) : (e.consume(k), k === 92 ? v : m);
  }
  function v(k) {
    return k === 40 || k === 41 || k === 92 ? (e.consume(k), m) : m(k);
  }
}
function As(e, t, n, r, i, s) {
  const o = this;
  let a = 0, u;
  return l;
  function l(d) {
    return e.enter(r), e.enter(i), e.consume(d), e.exit(i), e.enter(s), c;
  }
  function c(d) {
    return a > 999 || d === null || d === 91 || d === 93 && !u || // To do: remove in the future once we’ve switched from
    // `micromark-extension-footnote` to `micromark-extension-gfm-footnote`,
    // which doesn’t need this.
    // Hidden footnotes hook.
    /* c8 ignore next 3 */
    d === 94 && !a && "_hiddenFootnoteSupport" in o.parser.constructs ? n(d) : d === 93 ? (e.exit(s), e.enter(i), e.consume(d), e.exit(i), e.exit(r), t) : z(d) ? (e.enter("lineEnding"), e.consume(d), e.exit("lineEnding"), c) : (e.enter("chunkString", {
      contentType: "string"
    }), f(d));
  }
  function f(d) {
    return d === null || d === 91 || d === 93 || z(d) || a++ > 999 ? (e.exit("chunkString"), c(d)) : (e.consume(d), u || (u = !U(d)), d === 92 ? h : f);
  }
  function h(d) {
    return d === 91 || d === 92 || d === 93 ? (e.consume(d), a++, f) : f(d);
  }
}
function Rs(e, t, n, r, i, s) {
  let o;
  return a;
  function a(h) {
    return h === 34 || h === 39 || h === 40 ? (e.enter(r), e.enter(i), e.consume(h), e.exit(i), o = h === 40 ? 41 : h, u) : n(h);
  }
  function u(h) {
    return h === o ? (e.enter(i), e.consume(h), e.exit(i), e.exit(r), t) : (e.enter(s), l(h));
  }
  function l(h) {
    return h === o ? (e.exit(s), u(o)) : h === null ? n(h) : z(h) ? (e.enter("lineEnding"), e.consume(h), e.exit("lineEnding"), K(e, l, "linePrefix")) : (e.enter("chunkString", {
      contentType: "string"
    }), c(h));
  }
  function c(h) {
    return h === o || h === null || z(h) ? (e.exit("chunkString"), l(h)) : (e.consume(h), h === 92 ? f : c);
  }
  function f(h) {
    return h === o || h === 92 ? (e.consume(h), c) : c(h);
  }
}
function St(e, t) {
  let n;
  return r;
  function r(i) {
    return z(i) ? (e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), n = !0, r) : U(i) ? K(e, r, n ? "linePrefix" : "lineSuffix")(i) : t(i);
  }
}
const pu = {
  name: "definition",
  tokenize: mu
}, gu = {
  partial: !0,
  tokenize: yu
};
function mu(e, t, n) {
  const r = this;
  let i;
  return s;
  function s(d) {
    return e.enter("definition"), o(d);
  }
  function o(d) {
    return As.call(
      r,
      e,
      a,
      // Note: we don’t need to reset the way `markdown-rs` does.
      n,
      "definitionLabel",
      "definitionLabelMarker",
      "definitionLabelString"
    )(d);
  }
  function a(d) {
    return i = Ie(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1)), d === 58 ? (e.enter("definitionMarker"), e.consume(d), e.exit("definitionMarker"), u) : n(d);
  }
  function u(d) {
    return X(d) ? St(e, l)(d) : l(d);
  }
  function l(d) {
    return Ls(
      e,
      c,
      // Note: we don’t need to reset the way `markdown-rs` does.
      n,
      "definitionDestination",
      "definitionDestinationLiteral",
      "definitionDestinationLiteralMarker",
      "definitionDestinationRaw",
      "definitionDestinationString"
    )(d);
  }
  function c(d) {
    return e.attempt(gu, f, f)(d);
  }
  function f(d) {
    return U(d) ? K(e, h, "whitespace")(d) : h(d);
  }
  function h(d) {
    return d === null || z(d) ? (e.exit("definition"), r.parser.defined.push(i), t(d)) : n(d);
  }
}
function yu(e, t, n) {
  return r;
  function r(a) {
    return X(a) ? St(e, i)(a) : n(a);
  }
  function i(a) {
    return Rs(e, s, n, "definitionTitle", "definitionTitleMarker", "definitionTitleString")(a);
  }
  function s(a) {
    return U(a) ? K(e, o, "whitespace")(a) : o(a);
  }
  function o(a) {
    return a === null || z(a) ? t(a) : n(a);
  }
}
const bu = {
  name: "hardBreakEscape",
  tokenize: xu
};
function xu(e, t, n) {
  return r;
  function r(s) {
    return e.enter("hardBreakEscape"), e.consume(s), i;
  }
  function i(s) {
    return z(s) ? (e.exit("hardBreakEscape"), t(s)) : n(s);
  }
}
const ku = {
  name: "headingAtx",
  resolve: vu,
  tokenize: wu
};
function vu(e, t) {
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
  }, xe(e, r, n - r + 1, [["enter", i, t], ["enter", s, t], ["exit", s, t], ["exit", i, t]])), e;
}
function wu(e, t, n) {
  let r = 0;
  return i;
  function i(c) {
    return e.enter("atxHeading"), s(c);
  }
  function s(c) {
    return e.enter("atxHeadingSequence"), o(c);
  }
  function o(c) {
    return c === 35 && r++ < 6 ? (e.consume(c), o) : c === null || X(c) ? (e.exit("atxHeadingSequence"), a(c)) : n(c);
  }
  function a(c) {
    return c === 35 ? (e.enter("atxHeadingSequence"), u(c)) : c === null || z(c) ? (e.exit("atxHeading"), t(c)) : U(c) ? K(e, a, "whitespace")(c) : (e.enter("atxHeadingText"), l(c));
  }
  function u(c) {
    return c === 35 ? (e.consume(c), u) : (e.exit("atxHeadingSequence"), a(c));
  }
  function l(c) {
    return c === null || c === 35 || X(c) ? (e.exit("atxHeadingText"), a(c)) : (e.consume(c), l);
  }
}
const Su = [
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
], hi = ["pre", "script", "style", "textarea"], Cu = {
  concrete: !0,
  name: "htmlFlow",
  resolveTo: Nu,
  tokenize: Tu
}, Eu = {
  partial: !0,
  tokenize: Au
}, Iu = {
  partial: !0,
  tokenize: Lu
};
function Nu(e) {
  let t = e.length;
  for (; t-- && !(e[t][0] === "enter" && e[t][1].type === "htmlFlow"); )
    ;
  return t > 1 && e[t - 2][1].type === "linePrefix" && (e[t][1].start = e[t - 2][1].start, e[t + 1][1].start = e[t - 2][1].start, e.splice(t - 2, 2)), e;
}
function Tu(e, t, n) {
  const r = this;
  let i, s, o, a, u;
  return l;
  function l(b) {
    return c(b);
  }
  function c(b) {
    return e.enter("htmlFlow"), e.enter("htmlFlowData"), e.consume(b), f;
  }
  function f(b) {
    return b === 33 ? (e.consume(b), h) : b === 47 ? (e.consume(b), s = !0, m) : b === 63 ? (e.consume(b), i = 3, r.interrupt ? t : y) : fe(b) ? (e.consume(b), o = String.fromCharCode(b), v) : n(b);
  }
  function h(b) {
    return b === 45 ? (e.consume(b), i = 2, d) : b === 91 ? (e.consume(b), i = 5, a = 0, p) : fe(b) ? (e.consume(b), i = 4, r.interrupt ? t : y) : n(b);
  }
  function d(b) {
    return b === 45 ? (e.consume(b), r.interrupt ? t : y) : n(b);
  }
  function p(b) {
    const he = "CDATA[";
    return b === he.charCodeAt(a++) ? (e.consume(b), a === he.length ? r.interrupt ? t : D : p) : n(b);
  }
  function m(b) {
    return fe(b) ? (e.consume(b), o = String.fromCharCode(b), v) : n(b);
  }
  function v(b) {
    if (b === null || b === 47 || b === 62 || X(b)) {
      const he = b === 47, $e = o.toLowerCase();
      return !he && !s && hi.includes($e) ? (i = 1, r.interrupt ? t(b) : D(b)) : Su.includes(o.toLowerCase()) ? (i = 6, he ? (e.consume(b), k) : r.interrupt ? t(b) : D(b)) : (i = 7, r.interrupt && !r.parser.lazy[r.now().line] ? n(b) : s ? C(b) : S(b));
    }
    return b === 45 || ue(b) ? (e.consume(b), o += String.fromCharCode(b), v) : n(b);
  }
  function k(b) {
    return b === 62 ? (e.consume(b), r.interrupt ? t : D) : n(b);
  }
  function C(b) {
    return U(b) ? (e.consume(b), C) : w(b);
  }
  function S(b) {
    return b === 47 ? (e.consume(b), w) : b === 58 || b === 95 || fe(b) ? (e.consume(b), E) : U(b) ? (e.consume(b), S) : w(b);
  }
  function E(b) {
    return b === 45 || b === 46 || b === 58 || b === 95 || ue(b) ? (e.consume(b), E) : L(b);
  }
  function L(b) {
    return b === 61 ? (e.consume(b), x) : U(b) ? (e.consume(b), L) : S(b);
  }
  function x(b) {
    return b === null || b === 60 || b === 61 || b === 62 || b === 96 ? n(b) : b === 34 || b === 39 ? (e.consume(b), u = b, R) : U(b) ? (e.consume(b), x) : j(b);
  }
  function R(b) {
    return b === u ? (e.consume(b), u = null, F) : b === null || z(b) ? n(b) : (e.consume(b), R);
  }
  function j(b) {
    return b === null || b === 34 || b === 39 || b === 47 || b === 60 || b === 61 || b === 62 || b === 96 || X(b) ? L(b) : (e.consume(b), j);
  }
  function F(b) {
    return b === 47 || b === 62 || U(b) ? S(b) : n(b);
  }
  function w(b) {
    return b === 62 ? (e.consume(b), A) : n(b);
  }
  function A(b) {
    return b === null || z(b) ? D(b) : U(b) ? (e.consume(b), A) : n(b);
  }
  function D(b) {
    return b === 45 && i === 2 ? (e.consume(b), V) : b === 60 && i === 1 ? (e.consume(b), W) : b === 62 && i === 4 ? (e.consume(b), Z) : b === 63 && i === 3 ? (e.consume(b), y) : b === 93 && i === 5 ? (e.consume(b), se) : z(b) && (i === 6 || i === 7) ? (e.exit("htmlFlowData"), e.check(Eu, ae, M)(b)) : b === null || z(b) ? (e.exit("htmlFlowData"), M(b)) : (e.consume(b), D);
  }
  function M(b) {
    return e.check(Iu, _, ae)(b);
  }
  function _(b) {
    return e.enter("lineEnding"), e.consume(b), e.exit("lineEnding"), O;
  }
  function O(b) {
    return b === null || z(b) ? M(b) : (e.enter("htmlFlowData"), D(b));
  }
  function V(b) {
    return b === 45 ? (e.consume(b), y) : D(b);
  }
  function W(b) {
    return b === 47 ? (e.consume(b), o = "", te) : D(b);
  }
  function te(b) {
    if (b === 62) {
      const he = o.toLowerCase();
      return hi.includes(he) ? (e.consume(b), Z) : D(b);
    }
    return fe(b) && o.length < 8 ? (e.consume(b), o += String.fromCharCode(b), te) : D(b);
  }
  function se(b) {
    return b === 93 ? (e.consume(b), y) : D(b);
  }
  function y(b) {
    return b === 62 ? (e.consume(b), Z) : b === 45 && i === 2 ? (e.consume(b), y) : D(b);
  }
  function Z(b) {
    return b === null || z(b) ? (e.exit("htmlFlowData"), ae(b)) : (e.consume(b), Z);
  }
  function ae(b) {
    return e.exit("htmlFlow"), t(b);
  }
}
function Lu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return z(o) ? (e.enter("lineEnding"), e.consume(o), e.exit("lineEnding"), s) : n(o);
  }
  function s(o) {
    return r.parser.lazy[r.now().line] ? n(o) : t(o);
  }
}
function Au(e, t, n) {
  return r;
  function r(i) {
    return e.enter("lineEnding"), e.consume(i), e.exit("lineEnding"), e.attempt(Lt, t, n);
  }
}
const Ru = {
  name: "htmlText",
  tokenize: Ou
};
function Ou(e, t, n) {
  const r = this;
  let i, s, o;
  return a;
  function a(y) {
    return e.enter("htmlText"), e.enter("htmlTextData"), e.consume(y), u;
  }
  function u(y) {
    return y === 33 ? (e.consume(y), l) : y === 47 ? (e.consume(y), L) : y === 63 ? (e.consume(y), S) : fe(y) ? (e.consume(y), j) : n(y);
  }
  function l(y) {
    return y === 45 ? (e.consume(y), c) : y === 91 ? (e.consume(y), s = 0, p) : fe(y) ? (e.consume(y), C) : n(y);
  }
  function c(y) {
    return y === 45 ? (e.consume(y), d) : n(y);
  }
  function f(y) {
    return y === null ? n(y) : y === 45 ? (e.consume(y), h) : z(y) ? (o = f, W(y)) : (e.consume(y), f);
  }
  function h(y) {
    return y === 45 ? (e.consume(y), d) : f(y);
  }
  function d(y) {
    return y === 62 ? V(y) : y === 45 ? h(y) : f(y);
  }
  function p(y) {
    const Z = "CDATA[";
    return y === Z.charCodeAt(s++) ? (e.consume(y), s === Z.length ? m : p) : n(y);
  }
  function m(y) {
    return y === null ? n(y) : y === 93 ? (e.consume(y), v) : z(y) ? (o = m, W(y)) : (e.consume(y), m);
  }
  function v(y) {
    return y === 93 ? (e.consume(y), k) : m(y);
  }
  function k(y) {
    return y === 62 ? V(y) : y === 93 ? (e.consume(y), k) : m(y);
  }
  function C(y) {
    return y === null || y === 62 ? V(y) : z(y) ? (o = C, W(y)) : (e.consume(y), C);
  }
  function S(y) {
    return y === null ? n(y) : y === 63 ? (e.consume(y), E) : z(y) ? (o = S, W(y)) : (e.consume(y), S);
  }
  function E(y) {
    return y === 62 ? V(y) : S(y);
  }
  function L(y) {
    return fe(y) ? (e.consume(y), x) : n(y);
  }
  function x(y) {
    return y === 45 || ue(y) ? (e.consume(y), x) : R(y);
  }
  function R(y) {
    return z(y) ? (o = R, W(y)) : U(y) ? (e.consume(y), R) : V(y);
  }
  function j(y) {
    return y === 45 || ue(y) ? (e.consume(y), j) : y === 47 || y === 62 || X(y) ? F(y) : n(y);
  }
  function F(y) {
    return y === 47 ? (e.consume(y), V) : y === 58 || y === 95 || fe(y) ? (e.consume(y), w) : z(y) ? (o = F, W(y)) : U(y) ? (e.consume(y), F) : V(y);
  }
  function w(y) {
    return y === 45 || y === 46 || y === 58 || y === 95 || ue(y) ? (e.consume(y), w) : A(y);
  }
  function A(y) {
    return y === 61 ? (e.consume(y), D) : z(y) ? (o = A, W(y)) : U(y) ? (e.consume(y), A) : F(y);
  }
  function D(y) {
    return y === null || y === 60 || y === 61 || y === 62 || y === 96 ? n(y) : y === 34 || y === 39 ? (e.consume(y), i = y, M) : z(y) ? (o = D, W(y)) : U(y) ? (e.consume(y), D) : (e.consume(y), _);
  }
  function M(y) {
    return y === i ? (e.consume(y), i = void 0, O) : y === null ? n(y) : z(y) ? (o = M, W(y)) : (e.consume(y), M);
  }
  function _(y) {
    return y === null || y === 34 || y === 39 || y === 60 || y === 61 || y === 96 ? n(y) : y === 47 || y === 62 || X(y) ? F(y) : (e.consume(y), _);
  }
  function O(y) {
    return y === 47 || y === 62 || X(y) ? F(y) : n(y);
  }
  function V(y) {
    return y === 62 ? (e.consume(y), e.exit("htmlTextData"), e.exit("htmlText"), t) : n(y);
  }
  function W(y) {
    return e.exit("htmlTextData"), e.enter("lineEnding"), e.consume(y), e.exit("lineEnding"), te;
  }
  function te(y) {
    return U(y) ? K(e, se, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(y) : se(y);
  }
  function se(y) {
    return e.enter("htmlTextData"), o(y);
  }
}
const ur = {
  name: "labelEnd",
  resolveAll: Fu,
  resolveTo: Mu,
  tokenize: zu
}, Pu = {
  tokenize: ju
}, Du = {
  tokenize: $u
}, _u = {
  tokenize: Bu
};
function Fu(e) {
  let t = -1;
  const n = [];
  for (; ++t < e.length; ) {
    const r = e[t][1];
    if (n.push(e[t]), r.type === "labelImage" || r.type === "labelLink" || r.type === "labelEnd") {
      const i = r.type === "labelImage" ? 4 : 2;
      r.type = "data", t += i;
    }
  }
  return e.length !== n.length && xe(e, 0, e.length, n), e;
}
function Mu(e, t) {
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
  }, c = {
    type: "labelText",
    start: {
      ...e[s + r + 2][1].end
    },
    end: {
      ...e[o - 2][1].start
    }
  };
  return a = [["enter", u, t], ["enter", l, t]], a = ke(a, e.slice(s + 1, s + r + 3)), a = ke(a, [["enter", c, t]]), a = ke(a, Xt(t.parser.constructs.insideSpan.null, e.slice(s + r + 4, o - 3), t)), a = ke(a, [["exit", c, t], e[o - 2], e[o - 1], ["exit", l, t]]), a = ke(a, e.slice(o + 1)), a = ke(a, [["exit", u, t]]), xe(e, s, e.length, a), e;
}
function zu(e, t, n) {
  const r = this;
  let i = r.events.length, s, o;
  for (; i--; )
    if ((r.events[i][1].type === "labelImage" || r.events[i][1].type === "labelLink") && !r.events[i][1]._balanced) {
      s = r.events[i][1];
      break;
    }
  return a;
  function a(h) {
    return s ? s._inactive ? f(h) : (o = r.parser.defined.includes(Ie(r.sliceSerialize({
      start: s.end,
      end: r.now()
    }))), e.enter("labelEnd"), e.enter("labelMarker"), e.consume(h), e.exit("labelMarker"), e.exit("labelEnd"), u) : n(h);
  }
  function u(h) {
    return h === 40 ? e.attempt(Pu, c, o ? c : f)(h) : h === 91 ? e.attempt(Du, c, o ? l : f)(h) : o ? c(h) : f(h);
  }
  function l(h) {
    return e.attempt(_u, c, f)(h);
  }
  function c(h) {
    return t(h);
  }
  function f(h) {
    return s._balanced = !0, n(h);
  }
}
function ju(e, t, n) {
  return r;
  function r(f) {
    return e.enter("resource"), e.enter("resourceMarker"), e.consume(f), e.exit("resourceMarker"), i;
  }
  function i(f) {
    return X(f) ? St(e, s)(f) : s(f);
  }
  function s(f) {
    return f === 41 ? c(f) : Ls(e, o, a, "resourceDestination", "resourceDestinationLiteral", "resourceDestinationLiteralMarker", "resourceDestinationRaw", "resourceDestinationString", 32)(f);
  }
  function o(f) {
    return X(f) ? St(e, u)(f) : c(f);
  }
  function a(f) {
    return n(f);
  }
  function u(f) {
    return f === 34 || f === 39 || f === 40 ? Rs(e, l, n, "resourceTitle", "resourceTitleMarker", "resourceTitleString")(f) : c(f);
  }
  function l(f) {
    return X(f) ? St(e, c)(f) : c(f);
  }
  function c(f) {
    return f === 41 ? (e.enter("resourceMarker"), e.consume(f), e.exit("resourceMarker"), e.exit("resource"), t) : n(f);
  }
}
function $u(e, t, n) {
  const r = this;
  return i;
  function i(a) {
    return As.call(r, e, s, o, "reference", "referenceMarker", "referenceString")(a);
  }
  function s(a) {
    return r.parser.defined.includes(Ie(r.sliceSerialize(r.events[r.events.length - 1][1]).slice(1, -1))) ? t(a) : n(a);
  }
  function o(a) {
    return n(a);
  }
}
function Bu(e, t, n) {
  return r;
  function r(s) {
    return e.enter("reference"), e.enter("referenceMarker"), e.consume(s), e.exit("referenceMarker"), i;
  }
  function i(s) {
    return s === 93 ? (e.enter("referenceMarker"), e.consume(s), e.exit("referenceMarker"), e.exit("reference"), t) : n(s);
  }
}
const Vu = {
  name: "labelStartImage",
  resolveAll: ur.resolveAll,
  tokenize: Hu
};
function Hu(e, t, n) {
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
const Uu = {
  name: "labelStartLink",
  resolveAll: ur.resolveAll,
  tokenize: qu
};
function qu(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return e.enter("labelLink"), e.enter("labelMarker"), e.consume(o), e.exit("labelMarker"), e.exit("labelLink"), s;
  }
  function s(o) {
    return o === 94 && "_hiddenFootnoteSupport" in r.parser.constructs ? n(o) : t(o);
  }
}
const mn = {
  name: "lineEnding",
  tokenize: Ku
};
function Ku(e, t) {
  return n;
  function n(r) {
    return e.enter("lineEnding"), e.consume(r), e.exit("lineEnding"), K(e, t, "linePrefix");
  }
}
const Bt = {
  name: "thematicBreak",
  tokenize: Wu
};
function Wu(e, t, n) {
  let r = 0, i;
  return s;
  function s(l) {
    return e.enter("thematicBreak"), o(l);
  }
  function o(l) {
    return i = l, a(l);
  }
  function a(l) {
    return l === i ? (e.enter("thematicBreakSequence"), u(l)) : r >= 3 && (l === null || z(l)) ? (e.exit("thematicBreak"), t(l)) : n(l);
  }
  function u(l) {
    return l === i ? (e.consume(l), r++, u) : (e.exit("thematicBreakSequence"), U(l) ? K(e, a, "whitespace")(l) : a(l));
  }
}
const pe = {
  continuation: {
    tokenize: Qu
  },
  exit: Zu,
  name: "list",
  tokenize: Yu
}, Gu = {
  partial: !0,
  tokenize: ec
}, Ju = {
  partial: !0,
  tokenize: Xu
};
function Yu(e, t, n) {
  const r = this, i = r.events[r.events.length - 1];
  let s = i && i[1].type === "linePrefix" ? i[2].sliceSerialize(i[1], !0).length : 0, o = 0;
  return a;
  function a(d) {
    const p = r.containerState.type || (d === 42 || d === 43 || d === 45 ? "listUnordered" : "listOrdered");
    if (p === "listUnordered" ? !r.containerState.marker || d === r.containerState.marker : Bn(d)) {
      if (r.containerState.type || (r.containerState.type = p, e.enter(p, {
        _container: !0
      })), p === "listUnordered")
        return e.enter("listItemPrefix"), d === 42 || d === 45 ? e.check(Bt, n, l)(d) : l(d);
      if (!r.interrupt || d === 49)
        return e.enter("listItemPrefix"), e.enter("listItemValue"), u(d);
    }
    return n(d);
  }
  function u(d) {
    return Bn(d) && ++o < 10 ? (e.consume(d), u) : (!r.interrupt || o < 2) && (r.containerState.marker ? d === r.containerState.marker : d === 41 || d === 46) ? (e.exit("listItemValue"), l(d)) : n(d);
  }
  function l(d) {
    return e.enter("listItemMarker"), e.consume(d), e.exit("listItemMarker"), r.containerState.marker = r.containerState.marker || d, e.check(
      Lt,
      // Can’t be empty when interrupting.
      r.interrupt ? n : c,
      e.attempt(Gu, h, f)
    );
  }
  function c(d) {
    return r.containerState.initialBlankLine = !0, s++, h(d);
  }
  function f(d) {
    return U(d) ? (e.enter("listItemPrefixWhitespace"), e.consume(d), e.exit("listItemPrefixWhitespace"), h) : n(d);
  }
  function h(d) {
    return r.containerState.size = s + r.sliceSerialize(e.exit("listItemPrefix"), !0).length, t(d);
  }
}
function Qu(e, t, n) {
  const r = this;
  return r.containerState._closeFlow = void 0, e.check(Lt, i, s);
  function i(a) {
    return r.containerState.furtherBlankLines = r.containerState.furtherBlankLines || r.containerState.initialBlankLine, K(e, t, "listItemIndent", r.containerState.size + 1)(a);
  }
  function s(a) {
    return r.containerState.furtherBlankLines || !U(a) ? (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, o(a)) : (r.containerState.furtherBlankLines = void 0, r.containerState.initialBlankLine = void 0, e.attempt(Ju, t, o)(a));
  }
  function o(a) {
    return r.containerState._closeFlow = !0, r.interrupt = void 0, K(e, e.attempt(pe, t, n), "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(a);
  }
}
function Xu(e, t, n) {
  const r = this;
  return K(e, i, "listItemIndent", r.containerState.size + 1);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return o && o[1].type === "listItemIndent" && o[2].sliceSerialize(o[1], !0).length === r.containerState.size ? t(s) : n(s);
  }
}
function Zu(e) {
  e.exit(this.containerState.type);
}
function ec(e, t, n) {
  const r = this;
  return K(e, i, "listItemPrefixWhitespace", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 5);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return !U(s) && o && o[1].type === "listItemPrefixWhitespace" ? t(s) : n(s);
  }
}
const pi = {
  name: "setextUnderline",
  resolveTo: tc,
  tokenize: nc
};
function tc(e, t) {
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
function nc(e, t, n) {
  const r = this;
  let i;
  return s;
  function s(l) {
    let c = r.events.length, f;
    for (; c--; )
      if (r.events[c][1].type !== "lineEnding" && r.events[c][1].type !== "linePrefix" && r.events[c][1].type !== "content") {
        f = r.events[c][1].type === "paragraph";
        break;
      }
    return !r.parser.lazy[r.now().line] && (r.interrupt || f) ? (e.enter("setextHeadingLine"), i = l, o(l)) : n(l);
  }
  function o(l) {
    return e.enter("setextHeadingLineSequence"), a(l);
  }
  function a(l) {
    return l === i ? (e.consume(l), a) : (e.exit("setextHeadingLineSequence"), U(l) ? K(e, u, "lineSuffix")(l) : u(l));
  }
  function u(l) {
    return l === null || z(l) ? (e.exit("setextHeadingLine"), t(l)) : n(l);
  }
}
const rc = {
  tokenize: ic
};
function ic(e) {
  const t = this, n = e.attempt(
    // Try to parse a blank line.
    Lt,
    r,
    // Try to parse initial flow (essentially, only code).
    e.attempt(this.parser.constructs.flowInitial, i, K(e, e.attempt(this.parser.constructs.flow, i, e.attempt(uu, i)), "linePrefix"))
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
const sc = {
  resolveAll: Ps()
}, oc = Os("string"), ac = Os("text");
function Os(e) {
  return {
    resolveAll: Ps(e === "text" ? lc : void 0),
    tokenize: t
  };
  function t(n) {
    const r = this, i = this.parser.constructs[e], s = n.attempt(i, o, a);
    return o;
    function o(c) {
      return l(c) ? s(c) : a(c);
    }
    function a(c) {
      if (c === null) {
        n.consume(c);
        return;
      }
      return n.enter("data"), n.consume(c), u;
    }
    function u(c) {
      return l(c) ? (n.exit("data"), s(c)) : (n.consume(c), u);
    }
    function l(c) {
      if (c === null)
        return !0;
      const f = i[c];
      let h = -1;
      if (f)
        for (; ++h < f.length; ) {
          const d = f[h];
          if (!d.previous || d.previous.call(r, r.previous))
            return !0;
        }
      return !1;
    }
  }
}
function Ps(e) {
  return t;
  function t(n, r) {
    let i = -1, s;
    for (; ++i <= n.length; )
      s === void 0 ? n[i] && n[i][1].type === "data" && (s = i, i++) : (!n[i] || n[i][1].type !== "data") && (i !== s + 2 && (n[s][1].end = n[i - 1][1].end, n.splice(s + 2, i - s - 2), i = s + 2), s = void 0);
    return e ? e(n, r) : n;
  }
}
function lc(e, t) {
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
const uc = {
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
  62: Es
}, cc = {
  91: pu
}, fc = {
  [-2]: gn,
  [-1]: gn,
  32: gn
}, dc = {
  35: ku,
  42: Bt,
  45: [pi, Bt],
  60: Cu,
  61: pi,
  95: Bt,
  96: di,
  126: di
}, hc = {
  38: Ns,
  92: Is
}, pc = {
  [-5]: mn,
  [-4]: mn,
  [-3]: mn,
  33: Vu,
  38: Ns,
  42: Vn,
  60: [Ul, Ru],
  91: Uu,
  92: [bu, Is],
  93: ur,
  95: Vn,
  96: ru
}, gc = {
  null: [Vn, sc]
}, mc = {
  null: [42, 95]
}, yc = {
  null: []
}, bc = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  attentionMarkers: mc,
  contentInitial: cc,
  disable: yc,
  document: uc,
  flow: dc,
  flowInitial: fc,
  insideSpan: gc,
  string: hc,
  text: pc
}, Symbol.toStringTag, { value: "Module" }));
function xc(e, t, n) {
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
    attempt: R(L),
    check: R(x),
    consume: C,
    enter: S,
    exit: E,
    interrupt: R(x, {
      interrupt: !0
    })
  }, l = {
    code: null,
    containerState: {},
    defineSkip: m,
    events: [],
    now: p,
    parser: e,
    previous: null,
    sliceSerialize: h,
    sliceStream: d,
    write: f
  };
  let c = t.tokenize.call(l, u);
  return t.resolveAll && s.push(t), l;
  function f(A) {
    return o = ke(o, A), v(), o[o.length - 1] !== null ? [] : (j(t, 0), l.events = Xt(s, l.events, l), l.events);
  }
  function h(A, D) {
    return vc(d(A), D);
  }
  function d(A) {
    return kc(o, A);
  }
  function p() {
    const {
      _bufferIndex: A,
      _index: D,
      line: M,
      column: _,
      offset: O
    } = r;
    return {
      _bufferIndex: A,
      _index: D,
      line: M,
      column: _,
      offset: O
    };
  }
  function m(A) {
    i[A.line] = A.column, w();
  }
  function v() {
    let A;
    for (; r._index < o.length; ) {
      const D = o[r._index];
      if (typeof D == "string")
        for (A = r._index, r._bufferIndex < 0 && (r._bufferIndex = 0); r._index === A && r._bufferIndex < D.length; )
          k(D.charCodeAt(r._bufferIndex));
      else
        k(D);
    }
  }
  function k(A) {
    c = c(A);
  }
  function C(A) {
    z(A) ? (r.line++, r.column = 1, r.offset += A === -3 ? 2 : 1, w()) : A !== -1 && (r.column++, r.offset++), r._bufferIndex < 0 ? r._index++ : (r._bufferIndex++, r._bufferIndex === // Points w/ non-negative `_bufferIndex` reference
    // strings.
    /** @type {string} */
    o[r._index].length && (r._bufferIndex = -1, r._index++)), l.previous = A;
  }
  function S(A, D) {
    const M = D || {};
    return M.type = A, M.start = p(), l.events.push(["enter", M, l]), a.push(M), M;
  }
  function E(A) {
    const D = a.pop();
    return D.end = p(), l.events.push(["exit", D, l]), D;
  }
  function L(A, D) {
    j(A, D.from);
  }
  function x(A, D) {
    D.restore();
  }
  function R(A, D) {
    return M;
    function M(_, O, V) {
      let W, te, se, y;
      return Array.isArray(_) ? (
        /* c8 ignore next 1 */
        ae(_)
      ) : "tokenize" in _ ? (
        // Looks like a construct.
        ae([
          /** @type {Construct} */
          _
        ])
      ) : Z(_);
      function Z(le) {
        return ut;
        function ut(_e) {
          const Qe = _e !== null && le[_e], Xe = _e !== null && le.null, Rt = [
            // To do: add more extension tests.
            /* c8 ignore next 2 */
            ...Array.isArray(Qe) ? Qe : Qe ? [Qe] : [],
            ...Array.isArray(Xe) ? Xe : Xe ? [Xe] : []
          ];
          return ae(Rt)(_e);
        }
      }
      function ae(le) {
        return W = le, te = 0, le.length === 0 ? V : b(le[te]);
      }
      function b(le) {
        return ut;
        function ut(_e) {
          return y = F(), se = le, le.partial || (l.currentConstruct = le), le.name && l.parser.constructs.disable.null.includes(le.name) ? $e() : le.tokenize.call(
            // If we do have fields, create an object w/ `context` as its
            // prototype.
            // This allows a “live binding”, which is needed for `interrupt`.
            D ? Object.assign(Object.create(l), D) : l,
            u,
            he,
            $e
          )(_e);
        }
      }
      function he(le) {
        return A(se, y), O;
      }
      function $e(le) {
        return y.restore(), ++te < W.length ? b(W[te]) : V;
      }
    }
  }
  function j(A, D) {
    A.resolveAll && !s.includes(A) && s.push(A), A.resolve && xe(l.events, D, l.events.length - D, A.resolve(l.events.slice(D), l)), A.resolveTo && (l.events = A.resolveTo(l.events, l));
  }
  function F() {
    const A = p(), D = l.previous, M = l.currentConstruct, _ = l.events.length, O = Array.from(a);
    return {
      from: _,
      restore: V
    };
    function V() {
      r = A, l.previous = D, l.currentConstruct = M, l.events.length = _, a = O, w();
    }
  }
  function w() {
    r.line in i && r.column < 2 && (r.column = i[r.line], r.offset += i[r.line] - 1);
  }
}
function kc(e, t) {
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
function vc(e, t) {
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
function wc(e) {
  const r = {
    constructs: (
      /** @type {FullNormalizedExtension} */
      Ss([bc, ...(e || {}).extensions || []])
    ),
    content: i(Ml),
    defined: [],
    document: i(jl),
    flow: i(rc),
    lazy: {},
    string: i(oc),
    text: i(ac)
  };
  return r;
  function i(s) {
    return o;
    function o(a) {
      return xc(r, s, a);
    }
  }
}
function Sc(e) {
  for (; !Ts(e); )
    ;
  return e;
}
const gi = /[\0\t\n\r]/g;
function Cc() {
  let e = 1, t = "", n = !0, r;
  return i;
  function i(s, o, a) {
    const u = [];
    let l, c, f, h, d;
    for (s = t + (typeof s == "string" ? s.toString() : new TextDecoder(o || void 0).decode(s)), f = 0, t = "", n && (s.charCodeAt(0) === 65279 && f++, n = void 0); f < s.length; ) {
      if (gi.lastIndex = f, l = gi.exec(s), h = l && l.index !== void 0 ? l.index : s.length, d = s.charCodeAt(h), !l) {
        t = s.slice(f);
        break;
      }
      if (d === 10 && f === h && r)
        u.push(-3), r = void 0;
      else
        switch (r && (u.push(-5), r = void 0), f < h && (u.push(s.slice(f, h)), e += h - f), d) {
          case 0: {
            u.push(65533), e++;
            break;
          }
          case 9: {
            for (c = Math.ceil(e / 4) * 4, u.push(-2); e++ < c; ) u.push(-1);
            break;
          }
          case 10: {
            u.push(-4), e = 1;
            break;
          }
          default:
            r = !0, e = 1;
        }
      f = h + 1;
    }
    return a && (r && u.push(-5), t && u.push(t), u.push(null)), u;
  }
}
const Ec = /\\([!-/:-@[-`{-~])|&(#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/gi;
function Ic(e) {
  return e.replace(Ec, Nc);
}
function Nc(e, t, n) {
  if (t)
    return t;
  if (n.charCodeAt(0) === 35) {
    const i = n.charCodeAt(1), s = i === 120 || i === 88;
    return Cs(n.slice(s ? 2 : 1), s ? 16 : 10);
  }
  return lr(n) || e;
}
const Ds = {}.hasOwnProperty;
function Tc(e, t, n) {
  return t && typeof t == "object" && (n = t, t = void 0), Lc(n)(Sc(wc(n).document().write(Cc()(e, t, !0))));
}
function Lc(e) {
  const t = {
    transforms: [],
    canContainEols: ["emphasis", "fragment", "heading", "paragraph", "strong"],
    enter: {
      autolink: s(Sr),
      autolinkProtocol: F,
      autolinkEmail: F,
      atxHeading: s(kr),
      blockQuote: s(Xe),
      characterEscape: F,
      characterReference: F,
      codeFenced: s(Rt),
      codeFencedFenceInfo: o,
      codeFencedFenceMeta: o,
      codeIndented: s(Rt, o),
      codeText: s(ko, o),
      codeTextData: F,
      data: F,
      codeFlowValue: F,
      definition: s(vo),
      definitionDestinationString: o,
      definitionLabelString: o,
      definitionTitleString: o,
      emphasis: s(wo),
      hardBreakEscape: s(vr),
      hardBreakTrailing: s(vr),
      htmlFlow: s(wr, o),
      htmlFlowData: F,
      htmlText: s(wr, o),
      htmlTextData: F,
      image: s(So),
      label: o,
      link: s(Sr),
      listItem: s(Co),
      listItemValue: h,
      listOrdered: s(Cr, f),
      listUnordered: s(Cr),
      paragraph: s(Eo),
      reference: b,
      referenceString: o,
      resourceDestinationString: o,
      resourceTitleString: o,
      setextHeading: s(kr),
      strong: s(Io),
      thematicBreak: s(To)
    },
    exit: {
      atxHeading: u(),
      atxHeadingSequence: L,
      autolink: u(),
      autolinkEmail: Qe,
      autolinkProtocol: _e,
      blockQuote: u(),
      characterEscapeValue: w,
      characterReferenceMarkerHexadecimal: $e,
      characterReferenceMarkerNumeric: $e,
      characterReferenceValue: le,
      characterReference: ut,
      codeFenced: u(v),
      codeFencedFence: m,
      codeFencedFenceInfo: d,
      codeFencedFenceMeta: p,
      codeFlowValue: w,
      codeIndented: u(k),
      codeText: u(O),
      codeTextData: w,
      data: w,
      definition: u(),
      definitionDestinationString: E,
      definitionLabelString: C,
      definitionTitleString: S,
      emphasis: u(),
      hardBreakEscape: u(D),
      hardBreakTrailing: u(D),
      htmlFlow: u(M),
      htmlFlowData: w,
      htmlText: u(_),
      htmlTextData: w,
      image: u(W),
      label: se,
      labelText: te,
      lineEnding: A,
      link: u(V),
      listItem: u(),
      listOrdered: u(),
      listUnordered: u(),
      paragraph: u(),
      referenceString: he,
      resourceDestinationString: y,
      resourceTitleString: Z,
      resource: ae,
      setextHeading: u(j),
      setextHeadingLineSequence: R,
      setextHeadingText: x,
      strong: u(),
      thematicBreak: u()
    }
  };
  _s(t, (e || {}).mdastExtensions || []);
  const n = {};
  return r;
  function r(I) {
    let P = {
      type: "root",
      children: []
    };
    const H = {
      stack: [P],
      tokenStack: [],
      config: t,
      enter: a,
      exit: l,
      buffer: o,
      resume: c,
      data: n
    }, q = [];
    let J = -1;
    for (; ++J < I.length; )
      if (I[J][1].type === "listOrdered" || I[J][1].type === "listUnordered")
        if (I[J][0] === "enter")
          q.push(J);
        else {
          const Se = q.pop();
          J = i(I, Se, J);
        }
    for (J = -1; ++J < I.length; ) {
      const Se = t[I[J][0]];
      Ds.call(Se, I[J][1].type) && Se[I[J][1].type].call(Object.assign({
        sliceSerialize: I[J][2].sliceSerialize
      }, H), I[J][1]);
    }
    if (H.tokenStack.length > 0) {
      const Se = H.tokenStack[H.tokenStack.length - 1];
      (Se[1] || mi).call(H, void 0, Se[0]);
    }
    for (P.position = {
      start: Fe(I.length > 0 ? I[0][1].start : {
        line: 1,
        column: 1,
        offset: 0
      }),
      end: Fe(I.length > 0 ? I[I.length - 2][1].end : {
        line: 1,
        column: 1,
        offset: 0
      })
    }, J = -1; ++J < t.transforms.length; )
      P = t.transforms[J](P) || P;
    return P;
  }
  function i(I, P, H) {
    let q = P - 1, J = -1, Se = !1, Be, Ae, ct, ft;
    for (; ++q <= H; ) {
      const me = I[q];
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
          for (Ae = void 0; Ze--; ) {
            const Re = I[Ze];
            if (Re[1].type === "lineEnding" || Re[1].type === "lineEndingBlank") {
              if (Re[0] === "exit") continue;
              Ae && (I[Ae][1].type = "lineEndingBlank", Se = !0), Re[1].type = "lineEnding", Ae = Ze;
            } else if (!(Re[1].type === "linePrefix" || Re[1].type === "blockQuotePrefix" || Re[1].type === "blockQuotePrefixWhitespace" || Re[1].type === "blockQuoteMarker" || Re[1].type === "listItemIndent")) break;
          }
          ct && (!Ae || ct < Ae) && (Be._spread = !0), Be.end = Object.assign({}, Ae ? I[Ae][1].start : me[1].end), I.splice(Ae || q, 0, ["exit", Be, me[2]]), q++, H++;
        }
        if (me[1].type === "listItemPrefix") {
          const Ze = {
            type: "listItem",
            _spread: !1,
            start: Object.assign({}, me[1].start),
            // @ts-expect-error: we’ll add `end` in a second.
            end: void 0
          };
          Be = Ze, I.splice(q, 0, ["enter", Ze, me[2]]), q++, H++, ct = void 0, ft = !0;
        }
      }
    }
    return I[P][1]._spread = Se, H;
  }
  function s(I, P) {
    return H;
    function H(q) {
      a.call(this, I(q), q), P && P.call(this, q);
    }
  }
  function o() {
    this.stack.push({
      type: "fragment",
      children: []
    });
  }
  function a(I, P, H) {
    this.stack[this.stack.length - 1].children.push(I), this.stack.push(I), this.tokenStack.push([P, H || void 0]), I.position = {
      start: Fe(P.start),
      // @ts-expect-error: `end` will be patched later.
      end: void 0
    };
  }
  function u(I) {
    return P;
    function P(H) {
      I && I.call(this, H), l.call(this, H);
    }
  }
  function l(I, P) {
    const H = this.stack.pop(), q = this.tokenStack.pop();
    if (q)
      q[0].type !== I.type && (P ? P.call(this, I, q[0]) : (q[1] || mi).call(this, I, q[0]));
    else throw new Error("Cannot close `" + I.type + "` (" + wt({
      start: I.start,
      end: I.end
    }) + "): it’s not open");
    H.position.end = Fe(I.end);
  }
  function c() {
    return ar(this.stack.pop());
  }
  function f() {
    this.data.expectingFirstListItemValue = !0;
  }
  function h(I) {
    if (this.data.expectingFirstListItemValue) {
      const P = this.stack[this.stack.length - 2];
      P.start = Number.parseInt(this.sliceSerialize(I), 10), this.data.expectingFirstListItemValue = void 0;
    }
  }
  function d() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.lang = I;
  }
  function p() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.meta = I;
  }
  function m() {
    this.data.flowCodeInside || (this.buffer(), this.data.flowCodeInside = !0);
  }
  function v() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = I.replace(/^(\r?\n|\r)|(\r?\n|\r)$/g, ""), this.data.flowCodeInside = void 0;
  }
  function k() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = I.replace(/(\r?\n|\r)$/g, "");
  }
  function C(I) {
    const P = this.resume(), H = this.stack[this.stack.length - 1];
    H.label = P, H.identifier = Ie(this.sliceSerialize(I)).toLowerCase();
  }
  function S() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.title = I;
  }
  function E() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.url = I;
  }
  function L(I) {
    const P = this.stack[this.stack.length - 1];
    if (!P.depth) {
      const H = this.sliceSerialize(I).length;
      P.depth = H;
    }
  }
  function x() {
    this.data.setextHeadingSlurpLineEnding = !0;
  }
  function R(I) {
    const P = this.stack[this.stack.length - 1];
    P.depth = this.sliceSerialize(I).codePointAt(0) === 61 ? 1 : 2;
  }
  function j() {
    this.data.setextHeadingSlurpLineEnding = void 0;
  }
  function F(I) {
    const H = this.stack[this.stack.length - 1].children;
    let q = H[H.length - 1];
    (!q || q.type !== "text") && (q = No(), q.position = {
      start: Fe(I.start),
      // @ts-expect-error: we’ll add `end` later.
      end: void 0
    }, H.push(q)), this.stack.push(q);
  }
  function w(I) {
    const P = this.stack.pop();
    P.value += this.sliceSerialize(I), P.position.end = Fe(I.end);
  }
  function A(I) {
    const P = this.stack[this.stack.length - 1];
    if (this.data.atHardBreak) {
      const H = P.children[P.children.length - 1];
      H.position.end = Fe(I.end), this.data.atHardBreak = void 0;
      return;
    }
    !this.data.setextHeadingSlurpLineEnding && t.canContainEols.includes(P.type) && (F.call(this, I), w.call(this, I));
  }
  function D() {
    this.data.atHardBreak = !0;
  }
  function M() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = I;
  }
  function _() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = I;
  }
  function O() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.value = I;
  }
  function V() {
    const I = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const P = this.data.referenceType || "shortcut";
      I.type += "Reference", I.referenceType = P, delete I.url, delete I.title;
    } else
      delete I.identifier, delete I.label;
    this.data.referenceType = void 0;
  }
  function W() {
    const I = this.stack[this.stack.length - 1];
    if (this.data.inReference) {
      const P = this.data.referenceType || "shortcut";
      I.type += "Reference", I.referenceType = P, delete I.url, delete I.title;
    } else
      delete I.identifier, delete I.label;
    this.data.referenceType = void 0;
  }
  function te(I) {
    const P = this.sliceSerialize(I), H = this.stack[this.stack.length - 2];
    H.label = Ic(P), H.identifier = Ie(P).toLowerCase();
  }
  function se() {
    const I = this.stack[this.stack.length - 1], P = this.resume(), H = this.stack[this.stack.length - 1];
    if (this.data.inReference = !0, H.type === "link") {
      const q = I.children;
      H.children = q;
    } else
      H.alt = P;
  }
  function y() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.url = I;
  }
  function Z() {
    const I = this.resume(), P = this.stack[this.stack.length - 1];
    P.title = I;
  }
  function ae() {
    this.data.inReference = void 0;
  }
  function b() {
    this.data.referenceType = "collapsed";
  }
  function he(I) {
    const P = this.resume(), H = this.stack[this.stack.length - 1];
    H.label = P, H.identifier = Ie(this.sliceSerialize(I)).toLowerCase(), this.data.referenceType = "full";
  }
  function $e(I) {
    this.data.characterReferenceType = I.type;
  }
  function le(I) {
    const P = this.sliceSerialize(I), H = this.data.characterReferenceType;
    let q;
    H ? (q = Cs(P, H === "characterReferenceMarkerNumeric" ? 10 : 16), this.data.characterReferenceType = void 0) : q = lr(P);
    const J = this.stack[this.stack.length - 1];
    J.value += q;
  }
  function ut(I) {
    const P = this.stack.pop();
    P.position.end = Fe(I.end);
  }
  function _e(I) {
    w.call(this, I);
    const P = this.stack[this.stack.length - 1];
    P.url = this.sliceSerialize(I);
  }
  function Qe(I) {
    w.call(this, I);
    const P = this.stack[this.stack.length - 1];
    P.url = "mailto:" + this.sliceSerialize(I);
  }
  function Xe() {
    return {
      type: "blockquote",
      children: []
    };
  }
  function Rt() {
    return {
      type: "code",
      lang: null,
      meta: null,
      value: ""
    };
  }
  function ko() {
    return {
      type: "inlineCode",
      value: ""
    };
  }
  function vo() {
    return {
      type: "definition",
      identifier: "",
      label: null,
      title: null,
      url: ""
    };
  }
  function wo() {
    return {
      type: "emphasis",
      children: []
    };
  }
  function kr() {
    return {
      type: "heading",
      // @ts-expect-error `depth` will be set later.
      depth: 0,
      children: []
    };
  }
  function vr() {
    return {
      type: "break"
    };
  }
  function wr() {
    return {
      type: "html",
      value: ""
    };
  }
  function So() {
    return {
      type: "image",
      title: null,
      url: "",
      alt: null
    };
  }
  function Sr() {
    return {
      type: "link",
      title: null,
      url: "",
      children: []
    };
  }
  function Cr(I) {
    return {
      type: "list",
      ordered: I.type === "listOrdered",
      start: null,
      spread: I._spread,
      children: []
    };
  }
  function Co(I) {
    return {
      type: "listItem",
      spread: I._spread,
      checked: null,
      children: []
    };
  }
  function Eo() {
    return {
      type: "paragraph",
      children: []
    };
  }
  function Io() {
    return {
      type: "strong",
      children: []
    };
  }
  function No() {
    return {
      type: "text",
      value: ""
    };
  }
  function To() {
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
function _s(e, t) {
  let n = -1;
  for (; ++n < t.length; ) {
    const r = t[n];
    Array.isArray(r) ? _s(e, r) : Ac(e, r);
  }
}
function Ac(e, t) {
  let n;
  for (n in t)
    if (Ds.call(t, n))
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
function mi(e, t) {
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
function Rc(e) {
  const t = this;
  t.parser = n;
  function n(r) {
    return Tc(r, {
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
function Oc(e, t) {
  const n = {
    type: "element",
    tagName: "blockquote",
    properties: {},
    children: e.wrap(e.all(t), !0)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Pc(e, t) {
  const n = { type: "element", tagName: "br", properties: {}, children: [] };
  return e.patch(t, n), [e.applyData(t, n), { type: "text", value: `
` }];
}
function Dc(e, t) {
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
function _c(e, t) {
  const n = {
    type: "element",
    tagName: "del",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Fc(e, t) {
  const n = {
    type: "element",
    tagName: "em",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Mc(e, t) {
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
function zc(e, t) {
  const n = {
    type: "element",
    tagName: "h" + t.depth,
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function jc(e, t) {
  if (e.options.allowDangerousHtml) {
    const n = { type: "raw", value: t.value };
    return e.patch(t, n), e.applyData(t, n);
  }
}
function Fs(e, t) {
  const n = t.referenceType;
  let r = "]";
  if (n === "collapsed" ? r += "[]" : n === "full" && (r += "[" + (t.label || t.identifier) + "]"), t.type === "imageReference")
    return [{ type: "text", value: "![" + t.alt + r }];
  const i = e.all(t), s = i[0];
  s && s.type === "text" ? s.value = "[" + s.value : i.unshift({ type: "text", value: "[" });
  const o = i[i.length - 1];
  return o && o.type === "text" ? o.value += r : i.push({ type: "text", value: r }), i;
}
function $c(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return Fs(e, t);
  const i = { src: lt(r.url || ""), alt: t.alt };
  r.title !== null && r.title !== void 0 && (i.title = r.title);
  const s = { type: "element", tagName: "img", properties: i, children: [] };
  return e.patch(t, s), e.applyData(t, s);
}
function Bc(e, t) {
  const n = { src: lt(t.url) };
  t.alt !== null && t.alt !== void 0 && (n.alt = t.alt), t.title !== null && t.title !== void 0 && (n.title = t.title);
  const r = { type: "element", tagName: "img", properties: n, children: [] };
  return e.patch(t, r), e.applyData(t, r);
}
function Vc(e, t) {
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
function Hc(e, t) {
  const n = String(t.identifier).toUpperCase(), r = e.definitionById.get(n);
  if (!r)
    return Fs(e, t);
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
function Uc(e, t) {
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
function qc(e, t, n) {
  const r = e.all(t), i = n ? Kc(n) : Ms(t), s = {}, o = [];
  if (typeof t.checked == "boolean") {
    const c = r[0];
    let f;
    c && c.type === "element" && c.tagName === "p" ? f = c : (f = { type: "element", tagName: "p", properties: {}, children: [] }, r.unshift(f)), f.children.length > 0 && f.children.unshift({ type: "text", value: " " }), f.children.unshift({
      type: "element",
      tagName: "input",
      properties: { type: "checkbox", checked: t.checked, disabled: !0 },
      children: []
    }), s.className = ["task-list-item"];
  }
  let a = -1;
  for (; ++a < r.length; ) {
    const c = r[a];
    (i || a !== 0 || c.type !== "element" || c.tagName !== "p") && o.push({ type: "text", value: `
` }), c.type === "element" && c.tagName === "p" && !i ? o.push(...c.children) : o.push(c);
  }
  const u = r[r.length - 1];
  u && (i || u.type !== "element" || u.tagName !== "p") && o.push({ type: "text", value: `
` });
  const l = { type: "element", tagName: "li", properties: s, children: o };
  return e.patch(t, l), e.applyData(t, l);
}
function Kc(e) {
  let t = !1;
  if (e.type === "list") {
    t = e.spread || !1;
    const n = e.children;
    let r = -1;
    for (; !t && ++r < n.length; )
      t = Ms(n[r]);
  }
  return t;
}
function Ms(e) {
  const t = e.spread;
  return t ?? e.children.length > 1;
}
function Wc(e, t) {
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
function Gc(e, t) {
  const n = {
    type: "element",
    tagName: "p",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Jc(e, t) {
  const n = { type: "root", children: e.wrap(e.all(t)) };
  return e.patch(t, n), e.applyData(t, n);
}
function Yc(e, t) {
  const n = {
    type: "element",
    tagName: "strong",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
function Qc(e, t) {
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
    }, a = rr(t.children[1]), u = ms(t.children[t.children.length - 1]);
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
function Xc(e, t, n) {
  const r = n ? n.children : void 0, s = (r ? r.indexOf(t) : 1) === 0 ? "th" : "td", o = n && n.type === "table" ? n.align : void 0, a = o ? o.length : t.children.length;
  let u = -1;
  const l = [];
  for (; ++u < a; ) {
    const f = t.children[u], h = {}, d = o ? o[u] : void 0;
    d && (h.align = d);
    let p = { type: "element", tagName: s, properties: h, children: [] };
    f && (p.children = e.all(f), e.patch(f, p), p = e.applyData(f, p)), l.push(p);
  }
  const c = {
    type: "element",
    tagName: "tr",
    properties: {},
    children: e.wrap(l, !0)
  };
  return e.patch(t, c), e.applyData(t, c);
}
function Zc(e, t) {
  const n = {
    type: "element",
    tagName: "td",
    // Assume body cell.
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, n), e.applyData(t, n);
}
const yi = 9, bi = 32;
function ef(e) {
  const t = String(e), n = /\r?\n|\r/g;
  let r = n.exec(t), i = 0;
  const s = [];
  for (; r; )
    s.push(
      xi(t.slice(i, r.index), i > 0, !0),
      r[0]
    ), i = r.index + r[0].length, r = n.exec(t);
  return s.push(xi(t.slice(i), i > 0, !1)), s.join("");
}
function xi(e, t, n) {
  let r = 0, i = e.length;
  if (t) {
    let s = e.codePointAt(r);
    for (; s === yi || s === bi; )
      r++, s = e.codePointAt(r);
  }
  if (n) {
    let s = e.codePointAt(i - 1);
    for (; s === yi || s === bi; )
      i--, s = e.codePointAt(i - 1);
  }
  return i > r ? e.slice(r, i) : "";
}
function tf(e, t) {
  const n = { type: "text", value: ef(String(t.value)) };
  return e.patch(t, n), e.applyData(t, n);
}
function nf(e, t) {
  const n = {
    type: "element",
    tagName: "hr",
    properties: {},
    children: []
  };
  return e.patch(t, n), e.applyData(t, n);
}
const rf = {
  blockquote: Oc,
  break: Pc,
  code: Dc,
  delete: _c,
  emphasis: Fc,
  footnoteReference: Mc,
  heading: zc,
  html: jc,
  imageReference: $c,
  image: Bc,
  inlineCode: Vc,
  linkReference: Hc,
  link: Uc,
  listItem: qc,
  list: Wc,
  paragraph: Gc,
  // @ts-expect-error: root is different, but hard to type.
  root: Jc,
  strong: Yc,
  table: Qc,
  tableCell: Zc,
  tableRow: Xc,
  text: tf,
  thematicBreak: nf,
  toml: Dt,
  yaml: Dt,
  definition: Dt,
  footnoteDefinition: Dt
};
function Dt() {
}
const zs = -1, Zt = 0, Ct = 1, Kt = 2, cr = 3, fr = 4, dr = 5, hr = 6, js = 7, $s = 8, Bs = typeof self == "object" ? self : globalThis, ki = (e, t) => {
  switch (e) {
    case "Function":
    case "SharedWorker":
    case "Worker":
    case "eval":
    case "setInterval":
    case "setTimeout":
      throw new TypeError("unable to deserialize " + e);
  }
  return new Bs[e](t);
}, sf = (e, t) => {
  const n = (i, s) => (e.set(s, i), i), r = (i) => {
    if (e.has(i))
      return e.get(i);
    const [s, o] = t[i];
    switch (s) {
      case Zt:
      case zs:
        return n(o, i);
      case Ct: {
        const a = n([], i);
        for (const u of o)
          a.push(r(u));
        return a;
      }
      case Kt: {
        const a = n({}, i);
        for (const [u, l] of o)
          a[r(u)] = r(l);
        return a;
      }
      case cr:
        return n(new Date(o), i);
      case fr: {
        const { source: a, flags: u } = o;
        return n(new RegExp(a, u), i);
      }
      case dr: {
        const a = n(/* @__PURE__ */ new Map(), i);
        for (const [u, l] of o)
          a.set(r(u), r(l));
        return a;
      }
      case hr: {
        const a = n(/* @__PURE__ */ new Set(), i);
        for (const u of o)
          a.add(r(u));
        return a;
      }
      case js: {
        const { name: a, message: u } = o;
        return n(
          typeof Bs[a] == "function" ? ki(a, u) : new Error(u),
          i
        );
      }
      case $s:
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
    return n(ki(s, o), i);
  };
  return r;
}, vi = (e) => sf(/* @__PURE__ */ new Map(), e)(0), He = "", { toString: of } = {}, { keys: af } = Object, bt = (e) => {
  const t = typeof e;
  if (t !== "object" || !e)
    return [Zt, t];
  const n = of.call(e).slice(8, -1);
  switch (n) {
    case "Array":
      return [Ct, He];
    case "Object":
      return [Kt, He];
    case "Date":
      return [cr, He];
    case "RegExp":
      return [fr, He];
    case "Map":
      return [dr, He];
    case "Set":
      return [hr, He];
    case "DataView":
      return [Ct, n];
  }
  return n.includes("Array") ? [Ct, n] : e instanceof Error ? [js, e.name || "Error"] : [Kt, n];
}, _t = ([e, t]) => e === Zt && (t === "function" || t === "symbol"), lf = (e, t, n, r) => {
  const i = (o, a) => {
    const u = r.push(o) - 1;
    return n.set(a, u), u;
  }, s = (o) => {
    if (n.has(o))
      return n.get(o);
    let [a, u] = bt(o);
    switch (a) {
      case Zt: {
        let c = o;
        switch (u) {
          case "bigint":
            a = $s, c = o.toString();
            break;
          case "function":
          case "symbol":
            if (e)
              throw new TypeError("unable to serialize " + u);
            c = null;
            break;
          case "undefined":
            return i([zs], o);
        }
        return i([a, c], o);
      }
      case Ct: {
        if (u) {
          let h = o;
          return u === "DataView" ? h = new Uint8Array(o.buffer) : u === "ArrayBuffer" && (h = new Uint8Array(o)), i([u, [...h]], o);
        }
        const c = [], f = i([a, c], o);
        for (const h of o)
          c.push(s(h));
        return f;
      }
      case Kt: {
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
        const c = [], f = i([a, c], o);
        for (const h of af(o))
          (e || !_t(bt(o[h]))) && c.push([s(h), s(o[h])]);
        return f;
      }
      case cr:
        return i([a, isNaN(o.getTime()) ? He : o.toISOString()], o);
      case fr: {
        const { source: c, flags: f } = o;
        return i([a, { source: c, flags: f }], o);
      }
      case dr: {
        const c = [], f = i([a, c], o);
        for (const [h, d] of o)
          (e || !(_t(bt(h)) || _t(bt(d)))) && c.push([s(h), s(d)]);
        return f;
      }
      case hr: {
        const c = [], f = i([a, c], o);
        for (const h of o)
          (e || !_t(bt(h))) && c.push(s(h));
        return f;
      }
    }
    const { message: l } = o;
    return i([a, { name: u, message: l }], o);
  };
  return s;
}, wi = (e, { json: t, lossy: n } = {}) => {
  const r = [];
  return lf(!(t || n), !!t, /* @__PURE__ */ new Map(), r)(e), r;
}, Wt = typeof structuredClone == "function" ? (
  /* c8 ignore start */
  (e, t) => t && ("json" in t || "lossy" in t) ? vi(wi(e, t)) : structuredClone(e)
) : (e, t) => vi(wi(e, t));
function uf(e, t) {
  const n = [{ type: "text", value: "↩" }];
  return t > 1 && n.push({
    type: "element",
    tagName: "sup",
    properties: {},
    children: [{ type: "text", value: String(t) }]
  }), n;
}
function cf(e, t) {
  return "Back to reference " + (e + 1) + (t > 1 ? "-" + t : "");
}
function ff(e) {
  const t = typeof e.options.clobberPrefix == "string" ? e.options.clobberPrefix : "user-content-", n = e.options.footnoteBackContent || uf, r = e.options.footnoteBackLabel || cf, i = e.options.footnoteLabel || "Footnotes", s = e.options.footnoteLabelTagName || "h2", o = e.options.footnoteLabelProperties || {
    className: ["sr-only"]
  }, a = [];
  let u = -1;
  for (; ++u < e.footnoteOrder.length; ) {
    const l = e.footnoteById.get(
      e.footnoteOrder[u]
    );
    if (!l)
      continue;
    const c = e.all(l), f = String(l.identifier).toUpperCase(), h = lt(f.toLowerCase());
    let d = 0;
    const p = [], m = e.footnoteCounts.get(f);
    for (; m !== void 0 && ++d <= m; ) {
      p.length > 0 && p.push({ type: "text", value: " " });
      let C = typeof n == "string" ? n : n(u, d);
      typeof C == "string" && (C = { type: "text", value: C }), p.push({
        type: "element",
        tagName: "a",
        properties: {
          href: "#" + t + "fnref-" + h + (d > 1 ? "-" + d : ""),
          dataFootnoteBackref: "",
          ariaLabel: typeof r == "string" ? r : r(u, d),
          className: ["data-footnote-backref"]
        },
        children: Array.isArray(C) ? C : [C]
      });
    }
    const v = c[c.length - 1];
    if (v && v.type === "element" && v.tagName === "p") {
      const C = v.children[v.children.length - 1];
      C && C.type === "text" ? C.value += " " : v.children.push({ type: "text", value: " " }), v.children.push(...p);
    } else
      c.push(...p);
    const k = {
      type: "element",
      tagName: "li",
      properties: { id: t + "fn-" + h },
      children: e.wrap(c, !0)
    };
    e.patch(l, k), a.push(k);
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
            ...Wt(o),
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
const en = (
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
      return gf;
    if (typeof e == "function")
      return tn(e);
    if (typeof e == "object")
      return Array.isArray(e) ? df(e) : (
        // Cast because `ReadonlyArray` goes into the above but `isArray`
        // narrows to `Array`.
        hf(
          /** @type {Props} */
          e
        )
      );
    if (typeof e == "string")
      return pf(e);
    throw new Error("Expected function, string, or object as test");
  })
);
function df(e) {
  const t = [];
  let n = -1;
  for (; ++n < e.length; )
    t[n] = en(e[n]);
  return tn(r);
  function r(...i) {
    let s = -1;
    for (; ++s < t.length; )
      if (t[s].apply(this, i)) return !0;
    return !1;
  }
}
function hf(e) {
  const t = (
    /** @type {Record<string, unknown>} */
    e
  );
  return tn(n);
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
function pf(e) {
  return tn(t);
  function t(n) {
    return n && n.type === e;
  }
}
function tn(e) {
  return t;
  function t(n, r, i) {
    return !!(mf(n) && e.call(
      this,
      n,
      typeof r == "number" ? r : void 0,
      i || void 0
    ));
  }
}
function gf() {
  return !0;
}
function mf(e) {
  return e !== null && typeof e == "object" && "type" in e;
}
const Vs = [], yf = !0, Hn = !1, bf = "skip";
function Hs(e, t, n, r) {
  let i;
  typeof t == "function" && typeof n != "function" ? (r = n, n = t) : i = t;
  const s = en(i), o = r ? -1 : 1;
  a(e, void 0, [])();
  function a(u, l, c) {
    const f = (
      /** @type {Record<string, unknown>} */
      u && typeof u == "object" ? u : {}
    );
    if (typeof f.type == "string") {
      const d = (
        // `hast`
        typeof f.tagName == "string" ? f.tagName : (
          // `xast`
          typeof f.name == "string" ? f.name : void 0
        )
      );
      Object.defineProperty(h, "name", {
        value: "node (" + (u.type + (d ? "<" + d + ">" : "")) + ")"
      });
    }
    return h;
    function h() {
      let d = Vs, p, m, v;
      if ((!t || s(u, l, c[c.length - 1] || void 0)) && (d = xf(n(u, c)), d[0] === Hn))
        return d;
      if ("children" in u && u.children) {
        const k = (
          /** @type {UnistParent} */
          u
        );
        if (k.children && d[0] !== bf)
          for (m = (r ? k.children.length : -1) + o, v = c.concat(k); m > -1 && m < k.children.length; ) {
            const C = k.children[m];
            if (p = a(C, m, v)(), p[0] === Hn)
              return p;
            m = typeof p[1] == "number" ? p[1] : m + o;
          }
      }
      return d;
    }
  }
}
function xf(e) {
  return Array.isArray(e) ? e : typeof e == "number" ? [yf, e] : e == null ? Vs : [e];
}
function pr(e, t, n, r) {
  let i, s, o;
  typeof t == "function" && typeof n != "function" ? (s = void 0, o = t, i = n) : (s = t, o = n, i = r), Hs(e, s, a, i);
  function a(u, l) {
    const c = l[l.length - 1], f = c ? c.children.indexOf(u) : void 0;
    return o(u, f, c);
  }
}
const Un = {}.hasOwnProperty, kf = {};
function vf(e, t) {
  const n = t || kf, r = /* @__PURE__ */ new Map(), i = /* @__PURE__ */ new Map(), s = /* @__PURE__ */ new Map(), o = { ...rf, ...n.handlers }, a = {
    all: l,
    applyData: Sf,
    definitionById: r,
    footnoteById: i,
    footnoteCounts: s,
    footnoteOrder: [],
    handlers: o,
    one: u,
    options: n,
    patch: wf,
    wrap: Ef
  };
  return pr(e, function(c) {
    if (c.type === "definition" || c.type === "footnoteDefinition") {
      const f = c.type === "definition" ? r : i, h = String(c.identifier).toUpperCase();
      f.has(h) || f.set(h, c);
    }
  }), a;
  function u(c, f) {
    const h = c.type, d = a.handlers[h];
    if (Un.call(a.handlers, h) && d)
      return d(a, c, f);
    if (a.options.passThrough && a.options.passThrough.includes(h)) {
      if ("children" in c) {
        const { children: m, ...v } = c, k = Wt(v);
        return k.children = a.all(c), k;
      }
      return Wt(c);
    }
    return (a.options.unknownHandler || Cf)(a, c, f);
  }
  function l(c) {
    const f = [];
    if ("children" in c) {
      const h = c.children;
      let d = -1;
      for (; ++d < h.length; ) {
        const p = a.one(h[d], c);
        if (p) {
          if (d && h[d - 1].type === "break" && (!Array.isArray(p) && p.type === "text" && (p.value = Si(p.value)), !Array.isArray(p) && p.type === "element")) {
            const m = p.children[0];
            m && m.type === "text" && (m.value = Si(m.value));
          }
          Array.isArray(p) ? f.push(...p) : f.push(p);
        }
      }
    }
    return f;
  }
}
function wf(e, t) {
  e.position && (t.position = ul(e));
}
function Sf(e, t) {
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
    n.type === "element" && s && Object.assign(n.properties, Wt(s)), "children" in n && n.children && i !== null && i !== void 0 && (n.children = i);
  }
  return n;
}
function Cf(e, t) {
  const n = t.data || {}, r = "value" in t && !(Un.call(n, "hProperties") || Un.call(n, "hChildren")) ? { type: "text", value: t.value } : {
    type: "element",
    tagName: "div",
    properties: {},
    children: e.all(t)
  };
  return e.patch(t, r), e.applyData(t, r);
}
function Ef(e, t) {
  const n = [];
  let r = -1;
  for (t && n.push({ type: "text", value: `
` }); ++r < e.length; )
    r && n.push({ type: "text", value: `
` }), n.push(e[r]);
  return t && e.length > 0 && n.push({ type: "text", value: `
` }), n;
}
function Si(e) {
  let t = 0, n = e.charCodeAt(t);
  for (; n === 9 || n === 32; )
    t++, n = e.charCodeAt(t);
  return e.slice(t);
}
function Ci(e, t) {
  const n = vf(e, t), r = n.one(e, void 0), i = ff(n), s = Array.isArray(r) ? { type: "root", children: r } : r || { type: "root", children: [] };
  return i && s.children.push({ type: "text", value: `
` }, i), s;
}
function If(e, t) {
  return e && "run" in e ? async function(n, r) {
    const i = (
      /** @type {HastRoot} */
      Ci(n, { file: r, ...t })
    );
    await e.run(i, r);
  } : function(n, r) {
    return (
      /** @type {HastRoot} */
      Ci(n, { file: r, ...e || t })
    );
  };
}
function Ei(e) {
  if (e)
    throw e;
}
var yn, Ii;
function Nf() {
  if (Ii) return yn;
  Ii = 1;
  var e = Object.prototype.hasOwnProperty, t = Object.prototype.toString, n = Object.defineProperty, r = Object.getOwnPropertyDescriptor, i = function(l) {
    return typeof Array.isArray == "function" ? Array.isArray(l) : t.call(l) === "[object Array]";
  }, s = function(l) {
    if (!l || t.call(l) !== "[object Object]")
      return !1;
    var c = e.call(l, "constructor"), f = l.constructor && l.constructor.prototype && e.call(l.constructor.prototype, "isPrototypeOf");
    if (l.constructor && !c && !f)
      return !1;
    var h;
    for (h in l)
      ;
    return typeof h > "u" || e.call(l, h);
  }, o = function(l, c) {
    n && c.name === "__proto__" ? n(l, c.name, {
      enumerable: !0,
      configurable: !0,
      value: c.newValue,
      writable: !0
    }) : l[c.name] = c.newValue;
  }, a = function(l, c) {
    if (c === "__proto__")
      if (e.call(l, c)) {
        if (r)
          return r(l, c).value;
      } else return;
    return l[c];
  };
  return yn = function u() {
    var l, c, f, h, d, p, m = arguments[0], v = 1, k = arguments.length, C = !1;
    for (typeof m == "boolean" && (C = m, m = arguments[1] || {}, v = 2), (m == null || typeof m != "object" && typeof m != "function") && (m = {}); v < k; ++v)
      if (l = arguments[v], l != null)
        for (c in l)
          f = a(m, c), h = a(l, c), m !== h && (C && h && (s(h) || (d = i(h))) ? (d ? (d = !1, p = f && i(f) ? f : []) : p = f && s(f) ? f : {}, o(m, { name: c, newValue: u(C, p, h) })) : typeof h < "u" && o(m, { name: c, newValue: h }));
    return m;
  }, yn;
}
var Tf = Nf();
const bn = /* @__PURE__ */ Ji(Tf);
function qn(e) {
  if (typeof e != "object" || e === null)
    return !1;
  const t = Object.getPrototypeOf(e);
  return (t === null || t === Object.prototype || Object.getPrototypeOf(t) === null) && !(Symbol.toStringTag in e) && !(Symbol.iterator in e);
}
function Lf() {
  const e = [], t = { run: n, use: r };
  return t;
  function n(...i) {
    let s = -1;
    const o = i.pop();
    if (typeof o != "function")
      throw new TypeError("Expected function as last argument, not " + o);
    a(null, ...i);
    function a(u, ...l) {
      const c = e[++s];
      let f = -1;
      if (u) {
        o(u);
        return;
      }
      for (; ++f < i.length; )
        (l[f] === null || l[f] === void 0) && (l[f] = i[f]);
      i = l, c ? Af(c, a)(...l) : o(null, ...l);
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
function Af(e, t) {
  let n;
  return r;
  function r(...o) {
    const a = e.length > o.length;
    let u;
    a && o.push(i);
    try {
      u = e.apply(this, o);
    } catch (l) {
      const c = (
        /** @type {Error} */
        l
      );
      if (a && n)
        throw c;
      return i(c);
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
const Ne = { basename: Rf, dirname: Of, extname: Pf, join: Df, sep: "/" };
function Rf(e, t) {
  if (t !== void 0 && typeof t != "string")
    throw new TypeError('"ext" argument must be a string');
  At(e);
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
function Of(e) {
  if (At(e), e.length === 0)
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
function Pf(e) {
  At(e);
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
function Df(...e) {
  let t = -1, n;
  for (; ++t < e.length; )
    At(e[t]), e[t] && (n = n === void 0 ? e[t] : n + "/" + e[t]);
  return n === void 0 ? "." : _f(n);
}
function _f(e) {
  At(e);
  const t = e.codePointAt(0) === 47;
  let n = Ff(e, !t);
  return n.length === 0 && !t && (n = "."), n.length > 0 && e.codePointAt(e.length - 1) === 47 && (n += "/"), t ? "/" + n : n;
}
function Ff(e, t) {
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
function At(e) {
  if (typeof e != "string")
    throw new TypeError(
      "Path must be a string. Received " + JSON.stringify(e)
    );
}
const Mf = { cwd: zf };
function zf() {
  return "/";
}
function Kn(e) {
  return !!(e !== null && typeof e == "object" && "href" in e && e.href && "protocol" in e && e.protocol && // @ts-expect-error: indexing is fine.
  e.auth === void 0);
}
function jf(e) {
  if (typeof e == "string")
    e = new URL(e);
  else if (!Kn(e)) {
    const t = new TypeError(
      'The "path" argument must be of type string or an instance of URL. Received `' + e + "`"
    );
    throw t.code = "ERR_INVALID_ARG_TYPE", t;
  }
  if (e.protocol !== "file:") {
    const t = new TypeError("The URL must be of scheme file");
    throw t.code = "ERR_INVALID_URL_SCHEME", t;
  }
  return $f(e);
}
function $f(e) {
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
const xn = (
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
class Us {
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
    t ? Kn(t) ? n = { path: t } : typeof t == "string" || Bf(t) ? n = { value: t } : n = t : n = {}, this.cwd = "cwd" in n ? "" : Mf.cwd(), this.data = {}, this.history = [], this.messages = [], this.value, this.map, this.result, this.stored;
    let r = -1;
    for (; ++r < xn.length; ) {
      const s = xn[r];
      s in n && n[s] !== void 0 && n[s] !== null && (this[s] = s === "history" ? [...n[s]] : n[s]);
    }
    let i;
    for (i in n)
      xn.includes(i) || (this[i] = n[i]);
  }
  /**
   * Get the basename (including extname) (example: `'index.min.js'`).
   *
   * @returns {string | undefined}
   *   Basename.
   */
  get basename() {
    return typeof this.path == "string" ? Ne.basename(this.path) : void 0;
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
    vn(t, "basename"), kn(t, "basename"), this.path = Ne.join(this.dirname || "", t);
  }
  /**
   * Get the parent path (example: `'~'`).
   *
   * @returns {string | undefined}
   *   Dirname.
   */
  get dirname() {
    return typeof this.path == "string" ? Ne.dirname(this.path) : void 0;
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
    Ni(this.basename, "dirname"), this.path = Ne.join(t || "", this.basename);
  }
  /**
   * Get the extname (including dot) (example: `'.js'`).
   *
   * @returns {string | undefined}
   *   Extname.
   */
  get extname() {
    return typeof this.path == "string" ? Ne.extname(this.path) : void 0;
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
    if (kn(t, "extname"), Ni(this.dirname, "extname"), t) {
      if (t.codePointAt(0) !== 46)
        throw new Error("`extname` must start with `.`");
      if (t.includes(".", 1))
        throw new Error("`extname` cannot contain multiple dots");
    }
    this.path = Ne.join(this.dirname, this.stem + (t || ""));
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
    Kn(t) && (t = jf(t)), vn(t, "path"), this.path !== t && this.history.push(t);
  }
  /**
   * Get the stem (basename w/o extname) (example: `'index.min'`).
   *
   * @returns {string | undefined}
   *   Stem.
   */
  get stem() {
    return typeof this.path == "string" ? Ne.basename(this.path, this.extname) : void 0;
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
    vn(t, "stem"), kn(t, "stem"), this.path = Ne.join(this.dirname || "", t + (this.extname || ""));
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
    const i = new ce(
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
function kn(e, t) {
  if (e && e.includes(Ne.sep))
    throw new Error(
      "`" + t + "` cannot be a path: did not expect `" + Ne.sep + "`"
    );
}
function vn(e, t) {
  if (!e)
    throw new Error("`" + t + "` cannot be empty");
}
function Ni(e, t) {
  if (!e)
    throw new Error("Setting `" + t + "` requires `path` to be set too");
}
function Bf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const Vf = (
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
), Hf = {}.hasOwnProperty;
class gr extends Vf {
  /**
   * Create a processor.
   */
  constructor() {
    super("copy"), this.Compiler = void 0, this.Parser = void 0, this.attachers = [], this.compiler = void 0, this.freezeIndex = -1, this.frozen = void 0, this.namespace = {}, this.parser = void 0, this.transformers = Lf();
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
      new gr()
    );
    let n = -1;
    for (; ++n < this.attachers.length; ) {
      const r = this.attachers[n];
      t.use(...r);
    }
    return t.data(bn(!0, {}, this.namespace)), t;
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
    return typeof t == "string" ? arguments.length === 2 ? (Cn("data", this.frozen), this.namespace[t] = n, this) : Hf.call(this.namespace, t) && this.namespace[t] || void 0 : t ? (Cn("data", this.frozen), this.namespace = t, this) : this.namespace;
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
    const n = Ft(t), r = this.parser || this.Parser;
    return wn("parse", r), r(String(n), n);
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
    return this.freeze(), wn("process", this.parser || this.Parser), Sn("process", this.compiler || this.Compiler), n ? i(void 0, n) : new Promise(i);
    function i(s, o) {
      const a = Ft(t), u = (
        /** @type {HeadTree extends undefined ? Node : HeadTree} */
        /** @type {unknown} */
        r.parse(a)
      );
      r.run(u, a, function(c, f, h) {
        if (c || !f || !h)
          return l(c);
        const d = (
          /** @type {CompileTree extends undefined ? Node : CompileTree} */
          /** @type {unknown} */
          f
        ), p = r.stringify(d, h);
        Kf(p) ? h.value = p : h.result = p, l(
          c,
          /** @type {VFileWithOutput<CompileResult>} */
          h
        );
      });
      function l(c, f) {
        c || !f ? o(c) : s ? s(f) : n(void 0, f);
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
    return this.freeze(), wn("processSync", this.parser || this.Parser), Sn("processSync", this.compiler || this.Compiler), this.process(t, i), Li("processSync", "process", n), r;
    function i(s, o) {
      n = !0, Ei(s), r = o;
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
    Ti(t), this.freeze();
    const i = this.transformers;
    return !r && typeof n == "function" && (r = n, n = void 0), r ? s(void 0, r) : new Promise(s);
    function s(o, a) {
      const u = Ft(n);
      i.run(t, u, l);
      function l(c, f, h) {
        const d = (
          /** @type {TailTree extends undefined ? Node : TailTree} */
          f || t
        );
        c ? a(c) : o ? o(d) : r(void 0, d, h);
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
    return this.run(t, n, s), Li("runSync", "run", r), i;
    function s(o, a) {
      Ei(o), i = a, r = !0;
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
    const r = Ft(n), i = this.compiler || this.Compiler;
    return Sn("stringify", i), Ti(t), i(t, r);
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
    if (Cn("use", this.frozen), t != null) if (typeof t == "function")
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
          const [c, ...f] = (
            /** @type {PluginTuple<Array<unknown>>} */
            l
          );
          u(c, f);
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
      a(l.plugins), l.settings && (i.settings = bn(!0, i.settings, l.settings));
    }
    function a(l) {
      let c = -1;
      if (l != null) if (Array.isArray(l))
        for (; ++c < l.length; ) {
          const f = l[c];
          s(f);
        }
      else
        throw new TypeError("Expected a list of plugins, not `" + l + "`");
    }
    function u(l, c) {
      let f = -1, h = -1;
      for (; ++f < r.length; )
        if (r[f][0] === l) {
          h = f;
          break;
        }
      if (h === -1)
        r.push([l, ...c]);
      else if (c.length > 0) {
        let [d, ...p] = c;
        const m = r[h][1];
        qn(m) && qn(d) && (d = bn(!0, m, d)), r[h] = [l, d, ...p];
      }
    }
  }
}
const Uf = new gr().freeze();
function wn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `parser`");
}
function Sn(e, t) {
  if (typeof t != "function")
    throw new TypeError("Cannot `" + e + "` without `compiler`");
}
function Cn(e, t) {
  if (t)
    throw new Error(
      "Cannot call `" + e + "` on a frozen processor.\nCreate a new processor first, by calling it: use `processor()` instead of `processor`."
    );
}
function Ti(e) {
  if (!qn(e) || typeof e.type != "string")
    throw new TypeError("Expected node, got `" + e + "`");
}
function Li(e, t, n) {
  if (!n)
    throw new Error(
      "`" + e + "` finished async. Use `" + t + "` instead"
    );
}
function Ft(e) {
  return qf(e) ? e : new Us(e);
}
function qf(e) {
  return !!(e && typeof e == "object" && "message" in e && "messages" in e);
}
function Kf(e) {
  return typeof e == "string" || Wf(e);
}
function Wf(e) {
  return !!(e && typeof e == "object" && "byteLength" in e && "byteOffset" in e);
}
const Gf = "https://github.com/remarkjs/react-markdown/blob/main/changelog.md", Ai = [], Ri = { allowDangerousHtml: !0 }, Jf = /^(https?|ircs?|mailto|xmpp)$/i, Yf = [
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
function Qf(e) {
  const t = Xf(e), n = Zf(e);
  return ed(t.runSync(t.parse(n), n), e);
}
function Xf(e) {
  const t = e.rehypePlugins || Ai, n = e.remarkPlugins || Ai, r = e.remarkRehypeOptions ? { ...e.remarkRehypeOptions, ...Ri } : Ri;
  return Uf().use(Rc).use(n).use(If, r).use(t);
}
function Zf(e) {
  const t = e.children || "", n = new Us();
  return typeof t == "string" && (n.value = t), n;
}
function ed(e, t) {
  const n = t.allowedElements, r = t.allowElement, i = t.components, s = t.disallowedElements, o = t.skipHtml, a = t.unwrapDisallowed, u = t.urlTransform || td;
  for (const c of Yf)
    Object.hasOwn(t, c.from) && ("" + c.from + (c.to ? "use `" + c.to + "` instead" : "remove it") + Gf + c.id, void 0);
  return pr(e, l), pl(e, {
    Fragment: Gn,
    components: i,
    ignoreInvalidStyle: !0,
    jsx: g,
    jsxs: N,
    passKeys: !0,
    passNode: !0
  });
  function l(c, f, h) {
    if (c.type === "raw" && h && typeof f == "number")
      return o ? h.children.splice(f, 1) : h.children[f] = { type: "text", value: c.value }, f;
    if (c.type === "element") {
      let d;
      for (d in pn)
        if (Object.hasOwn(pn, d) && Object.hasOwn(c.properties, d)) {
          const p = c.properties[d], m = pn[d];
          (m === null || m.includes(c.tagName)) && (c.properties[d] = u(String(p || ""), d, c));
        }
    }
    if (c.type === "element") {
      let d = n ? !n.includes(c.tagName) : s ? s.includes(c.tagName) : !1;
      if (!d && r && typeof f == "number" && (d = !r(c, f, h)), d && h && typeof f == "number")
        return a && c.children ? h.children.splice(f, 1, ...c.children) : h.children.splice(f, 1), f;
    }
  }
}
function td(e) {
  const t = e.indexOf(":"), n = e.indexOf("?"), r = e.indexOf("#"), i = e.indexOf("/");
  return (
    // If there is no protocol, it’s relative.
    t === -1 || // If the first colon is after a `?`, `#`, or `/`, it’s not a protocol.
    i !== -1 && t > i || n !== -1 && t > n || r !== -1 && t > r || // It is a protocol, it should be allowed.
    Jf.test(e.slice(0, t)) ? e : ""
  );
}
function Oi(e, t) {
  const n = String(e);
  if (typeof t != "string")
    throw new TypeError("Expected character");
  let r = 0, i = n.indexOf(t);
  for (; i !== -1; )
    r++, i = n.indexOf(t, i + t.length);
  return r;
}
function nd(e) {
  if (typeof e != "string")
    throw new TypeError("Expected a string");
  return e.replace(/[|\\{}()[\]^$+*?.]/g, "\\$&").replace(/-/g, "\\x2d");
}
function rd(e, t, n) {
  const i = en((n || {}).ignore || []), s = id(t);
  let o = -1;
  for (; ++o < s.length; )
    Hs(e, "text", a);
  function a(l, c) {
    let f = -1, h;
    for (; ++f < c.length; ) {
      const d = c[f], p = h ? h.children : void 0;
      if (i(
        d,
        p ? p.indexOf(d) : void 0,
        h
      ))
        return;
      h = d;
    }
    if (h)
      return u(l, c);
  }
  function u(l, c) {
    const f = c[c.length - 1], h = s[o][0], d = s[o][1];
    let p = 0;
    const v = f.children.indexOf(l);
    let k = !1, C = [];
    h.lastIndex = 0;
    let S = h.exec(l.value);
    for (; S; ) {
      const E = S.index, L = {
        index: S.index,
        input: S.input,
        stack: [...c, l]
      };
      let x = d(...S, L);
      if (typeof x == "string" && (x = x.length > 0 ? { type: "text", value: x } : void 0), x === !1 ? h.lastIndex = E + 1 : (p !== E && C.push({
        type: "text",
        value: l.value.slice(p, E)
      }), Array.isArray(x) ? C.push(...x) : x && C.push(x), p = E + S[0].length, k = !0), !h.global)
        break;
      S = h.exec(l.value);
    }
    return k ? (p < l.value.length && C.push({ type: "text", value: l.value.slice(p) }), f.children.splice(v, 1, ...C)) : C = [l], v + C.length;
  }
}
function id(e) {
  const t = [];
  if (!Array.isArray(e))
    throw new TypeError("Expected find and replace tuple or list of tuples");
  const n = !e[0] || Array.isArray(e[0]) ? e : [e];
  let r = -1;
  for (; ++r < n.length; ) {
    const i = n[r];
    t.push([sd(i[0]), od(i[1])]);
  }
  return t;
}
function sd(e) {
  return typeof e == "string" ? new RegExp(nd(e), "g") : e;
}
function od(e) {
  return typeof e == "function" ? e : function() {
    return e;
  };
}
const En = "phrasing", In = ["autolink", "link", "image", "label"];
function ad() {
  return {
    transforms: [pd],
    enter: {
      literalAutolink: ud,
      literalAutolinkEmail: Nn,
      literalAutolinkHttp: Nn,
      literalAutolinkWww: Nn
    },
    exit: {
      literalAutolink: hd,
      literalAutolinkEmail: dd,
      literalAutolinkHttp: cd,
      literalAutolinkWww: fd
    }
  };
}
function ld() {
  return {
    unsafe: [
      {
        character: "@",
        before: "[+\\-.\\w]",
        after: "[\\-.\\w]",
        inConstruct: En,
        notInConstruct: In
      },
      {
        character: ".",
        before: "[Ww]",
        after: "[\\-.\\w]",
        inConstruct: En,
        notInConstruct: In
      },
      {
        character: ":",
        before: "[ps]",
        after: "\\/",
        inConstruct: En,
        notInConstruct: In
      }
    ]
  };
}
function ud(e) {
  this.enter({ type: "link", title: null, url: "", children: [] }, e);
}
function Nn(e) {
  this.config.enter.autolinkProtocol.call(this, e);
}
function cd(e) {
  this.config.exit.autolinkProtocol.call(this, e);
}
function fd(e) {
  this.config.exit.data.call(this, e);
  const t = this.stack[this.stack.length - 1];
  t.type, t.url = "http://" + this.sliceSerialize(e);
}
function dd(e) {
  this.config.exit.autolinkEmail.call(this, e);
}
function hd(e) {
  this.exit(e);
}
function pd(e) {
  rd(
    e,
    [
      [/(https?:\/\/|www(?=\.))([-.\w]+)([^ \t\r\n]*)/gi, gd],
      [/(?<=^|\s|\p{P}|\p{S})([-.\w+]+)@([-\w]+(?:\.[-\w]+)+)/gu, md]
    ],
    { ignore: ["link", "linkReference"] }
  );
}
function gd(e, t, n, r, i) {
  let s = "";
  if (!qs(i) || (/^w/i.test(t) && (n = t + n, t = "", s = "http://"), !yd(n)))
    return !1;
  const o = bd(n + r);
  if (!o[0]) return !1;
  const a = {
    type: "link",
    title: null,
    url: s + t + o[0],
    children: [{ type: "text", value: t + o[0] }]
  };
  return o[1] ? [a, { type: "text", value: o[1] }] : a;
}
function md(e, t, n, r) {
  return (
    // Not an expected previous character.
    !qs(r, !0) || // Label ends in not allowed character.
    /[-\d_]$/.test(n) ? !1 : {
      type: "link",
      title: null,
      url: "mailto:" + t + "@" + n,
      children: [{ type: "text", value: t + "@" + n }]
    }
  );
}
function yd(e) {
  const t = e.split(".");
  return !(t.length < 2 || t[t.length - 1] && (/_/.test(t[t.length - 1]) || !/[a-zA-Z\d]/.test(t[t.length - 1])) || t[t.length - 2] && (/_/.test(t[t.length - 2]) || !/[a-zA-Z\d]/.test(t[t.length - 2])));
}
function bd(e) {
  const t = /[!"&'),.:;<>?\]}]+$/.exec(e);
  if (!t)
    return [e, void 0];
  e = e.slice(0, t.index);
  let n = t[0], r = n.indexOf(")");
  const i = Oi(e, "(");
  let s = Oi(e, ")");
  for (; r !== -1 && i > s; )
    e += n.slice(0, r + 1), n = n.slice(r + 1), r = n.indexOf(")"), s++;
  return [e, n];
}
function qs(e, t) {
  const n = e.input.charCodeAt(e.index - 1);
  return (e.index === 0 || We(n) || Qt(n)) && // If it’s an email, the previous character should not be a slash.
  (!t || n !== 47);
}
Ks.peek = Nd;
function xd() {
  this.buffer();
}
function kd(e) {
  this.enter({ type: "footnoteReference", identifier: "", label: "" }, e);
}
function vd() {
  this.buffer();
}
function wd(e) {
  this.enter(
    { type: "footnoteDefinition", identifier: "", label: "", children: [] },
    e
  );
}
function Sd(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = Ie(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function Cd(e) {
  this.exit(e);
}
function Ed(e) {
  const t = this.resume(), n = this.stack[this.stack.length - 1];
  n.type, n.identifier = Ie(
    this.sliceSerialize(e)
  ).toLowerCase(), n.label = t;
}
function Id(e) {
  this.exit(e);
}
function Nd() {
  return "[";
}
function Ks(e, t, n, r) {
  const i = n.createTracker(r);
  let s = i.move("[^");
  const o = n.enter("footnoteReference"), a = n.enter("reference");
  return s += i.move(
    n.safe(n.associationId(e), { after: "]", before: s })
  ), a(), o(), s += i.move("]"), s;
}
function Td() {
  return {
    enter: {
      gfmFootnoteCallString: xd,
      gfmFootnoteCall: kd,
      gfmFootnoteDefinitionLabelString: vd,
      gfmFootnoteDefinition: wd
    },
    exit: {
      gfmFootnoteCallString: Sd,
      gfmFootnoteCall: Cd,
      gfmFootnoteDefinitionLabelString: Ed,
      gfmFootnoteDefinition: Id
    }
  };
}
function Ld(e) {
  let t = !1;
  return e && e.firstLineBlank && (t = !0), {
    handlers: { footnoteDefinition: n, footnoteReference: Ks },
    // This is on by default already.
    unsafe: [{ character: "[", inConstruct: ["label", "phrasing", "reference"] }]
  };
  function n(r, i, s, o) {
    const a = s.createTracker(o);
    let u = a.move("[^");
    const l = s.enter("footnoteDefinition"), c = s.enter("label");
    return u += a.move(
      s.safe(s.associationId(r), { before: u, after: "]" })
    ), c(), u += a.move("]:"), r.children && r.children.length > 0 && (a.shift(4), u += a.move(
      (t ? `
` : " ") + s.indentLines(
        s.containerFlow(r, a.current()),
        t ? Ws : Ad
      )
    )), l(), u;
  }
}
function Ad(e, t, n) {
  return t === 0 ? e : Ws(e, t, n);
}
function Ws(e, t, n) {
  return (n ? "" : "    ") + e;
}
const Rd = [
  "autolink",
  "destinationLiteral",
  "destinationRaw",
  "reference",
  "titleQuote",
  "titleApostrophe"
];
Gs.peek = Fd;
function Od() {
  return {
    canContainEols: ["delete"],
    enter: { strikethrough: Dd },
    exit: { strikethrough: _d }
  };
}
function Pd() {
  return {
    unsafe: [
      {
        character: "~",
        inConstruct: "phrasing",
        notInConstruct: Rd
      }
    ],
    handlers: { delete: Gs }
  };
}
function Dd(e) {
  this.enter({ type: "delete", children: [] }, e);
}
function _d(e) {
  this.exit(e);
}
function Gs(e, t, n, r) {
  const i = n.createTracker(r), s = n.enter("strikethrough");
  let o = i.move("~~");
  return o += n.containerPhrasing(e, {
    ...i.current(),
    before: o,
    after: "~"
  }), o += i.move("~~"), s(), o;
}
function Fd() {
  return "~";
}
function Md(e) {
  return e.length;
}
function zd(e, t) {
  const n = t || {}, r = (n.align || []).concat(), i = n.stringLength || Md, s = [], o = [], a = [], u = [];
  let l = 0, c = -1;
  for (; ++c < e.length; ) {
    const m = [], v = [];
    let k = -1;
    for (e[c].length > l && (l = e[c].length); ++k < e[c].length; ) {
      const C = jd(e[c][k]);
      if (n.alignDelimiters !== !1) {
        const S = i(C);
        v[k] = S, (u[k] === void 0 || S > u[k]) && (u[k] = S);
      }
      m.push(C);
    }
    o[c] = m, a[c] = v;
  }
  let f = -1;
  if (typeof r == "object" && "length" in r)
    for (; ++f < l; )
      s[f] = Pi(r[f]);
  else {
    const m = Pi(r);
    for (; ++f < l; )
      s[f] = m;
  }
  f = -1;
  const h = [], d = [];
  for (; ++f < l; ) {
    const m = s[f];
    let v = "", k = "";
    m === 99 ? (v = ":", k = ":") : m === 108 ? v = ":" : m === 114 && (k = ":");
    let C = n.alignDelimiters === !1 ? 1 : Math.max(
      1,
      u[f] - v.length - k.length
    );
    const S = v + "-".repeat(C) + k;
    n.alignDelimiters !== !1 && (C = v.length + C + k.length, C > u[f] && (u[f] = C), d[f] = C), h[f] = S;
  }
  o.splice(1, 0, h), a.splice(1, 0, d), c = -1;
  const p = [];
  for (; ++c < o.length; ) {
    const m = o[c], v = a[c];
    f = -1;
    const k = [];
    for (; ++f < l; ) {
      const C = m[f] || "";
      let S = "", E = "";
      if (n.alignDelimiters !== !1) {
        const L = u[f] - (v[f] || 0), x = s[f];
        x === 114 ? S = " ".repeat(L) : x === 99 ? L % 2 ? (S = " ".repeat(L / 2 + 0.5), E = " ".repeat(L / 2 - 0.5)) : (S = " ".repeat(L / 2), E = S) : E = " ".repeat(L);
      }
      n.delimiterStart !== !1 && !f && k.push("|"), n.padding !== !1 && // Don’t add the opening space if we’re not aligning and the cell is
      // empty: there will be a closing space.
      !(n.alignDelimiters === !1 && C === "") && (n.delimiterStart !== !1 || f) && k.push(" "), n.alignDelimiters !== !1 && k.push(S), k.push(C), n.alignDelimiters !== !1 && k.push(E), n.padding !== !1 && k.push(" "), (n.delimiterEnd !== !1 || f !== l - 1) && k.push("|");
    }
    p.push(
      n.delimiterEnd === !1 ? k.join("").replace(/ +$/, "") : k.join("")
    );
  }
  return p.join(`
`);
}
function jd(e) {
  return e == null ? "" : String(e);
}
function Pi(e) {
  const t = typeof e == "string" ? e.codePointAt(0) : 0;
  return t === 67 || t === 99 ? 99 : t === 76 || t === 108 ? 108 : t === 82 || t === 114 ? 114 : 0;
}
function $d(e, t, n, r) {
  const i = n.enter("blockquote"), s = n.createTracker(r);
  s.move("> "), s.shift(2);
  const o = n.indentLines(
    n.containerFlow(e, s.current()),
    Bd
  );
  return i(), o;
}
function Bd(e, t, n) {
  return ">" + (n ? "" : " ") + e;
}
function Vd(e, t) {
  return Di(e, t.inConstruct, !0) && !Di(e, t.notInConstruct, !1);
}
function Di(e, t, n) {
  if (typeof t == "string" && (t = [t]), !t || t.length === 0)
    return n;
  let r = -1;
  for (; ++r < t.length; )
    if (e.includes(t[r]))
      return !0;
  return !1;
}
function _i(e, t, n, r) {
  let i = -1;
  for (; ++i < n.unsafe.length; )
    if (n.unsafe[i].character === `
` && Vd(n.stack, n.unsafe[i]))
      return /[ \t]/.test(r.before) ? "" : " ";
  return `\\
`;
}
function Hd(e, t) {
  const n = String(e);
  let r = n.indexOf(t), i = r, s = 0, o = 0;
  if (typeof t != "string")
    throw new TypeError("Expected substring");
  for (; r !== -1; )
    r === i ? ++s > o && (o = s) : s = 1, i = r + t.length, r = n.indexOf(t, i);
  return o;
}
function Ud(e, t) {
  return !!(t.options.fences === !1 && e.value && // If there’s no info…
  !e.lang && // And there’s a non-whitespace character…
  /[^ \r\n]/.test(e.value) && // And the value doesn’t start or end in a blank…
  !/^[\t ]*(?:[\r\n]|$)|(?:^|[\r\n])[\t ]*$/.test(e.value));
}
function qd(e) {
  const t = e.options.fence || "`";
  if (t !== "`" && t !== "~")
    throw new Error(
      "Cannot serialize code with `" + t + "` for `options.fence`, expected `` ` `` or `~`"
    );
  return t;
}
function Kd(e, t, n, r) {
  const i = qd(n), s = e.value || "", o = i === "`" ? "GraveAccent" : "Tilde";
  if (Ud(e, n)) {
    const f = n.enter("codeIndented"), h = n.indentLines(s, Wd);
    return f(), h;
  }
  const a = n.createTracker(r), u = i.repeat(Math.max(Hd(s, i) + 1, 3)), l = n.enter("codeFenced");
  let c = a.move(u);
  if (e.lang) {
    const f = n.enter(`codeFencedLang${o}`);
    c += a.move(
      n.safe(e.lang, {
        before: c,
        after: " ",
        encode: ["`"],
        ...a.current()
      })
    ), f();
  }
  if (e.lang && e.meta) {
    const f = n.enter(`codeFencedMeta${o}`);
    c += a.move(" "), c += a.move(
      n.safe(e.meta, {
        before: c,
        after: `
`,
        encode: ["`"],
        ...a.current()
      })
    ), f();
  }
  return c += a.move(`
`), s && (c += a.move(s + `
`)), c += a.move(u), l(), c;
}
function Wd(e, t, n) {
  return (n ? "" : "    ") + e;
}
function mr(e) {
  const t = e.options.quote || '"';
  if (t !== '"' && t !== "'")
    throw new Error(
      "Cannot serialize title with `" + t + "` for `options.quote`, expected `\"`, or `'`"
    );
  return t;
}
function Gd(e, t, n, r) {
  const i = mr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.enter("definition");
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
function Jd(e) {
  const t = e.options.emphasis || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize emphasis with `" + t + "` for `options.emphasis`, expected `*`, or `_`"
    );
  return t;
}
function Nt(e) {
  return "&#x" + e.toString(16).toUpperCase() + ";";
}
function Gt(e, t, n) {
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
Js.peek = Yd;
function Js(e, t, n, r) {
  const i = Jd(n), s = n.enter("emphasis"), o = n.createTracker(r), a = o.move(i);
  let u = o.move(
    n.containerPhrasing(e, {
      after: i,
      before: a,
      ...o.current()
    })
  );
  const l = u.charCodeAt(0), c = Gt(
    r.before.charCodeAt(r.before.length - 1),
    l,
    i
  );
  c.inside && (u = Nt(l) + u.slice(1));
  const f = u.charCodeAt(u.length - 1), h = Gt(r.after.charCodeAt(0), f, i);
  h.inside && (u = u.slice(0, -1) + Nt(f));
  const d = o.move(i);
  return s(), n.attentionEncodeSurroundingInfo = {
    after: h.outside,
    before: c.outside
  }, a + u + d;
}
function Yd(e, t, n) {
  return n.options.emphasis || "*";
}
function Qd(e, t) {
  let n = !1;
  return pr(e, function(r) {
    if ("value" in r && /\r?\n|\r/.test(r.value) || r.type === "break")
      return n = !0, Hn;
  }), !!((!e.depth || e.depth < 3) && ar(e) && (t.options.setext || n));
}
function Xd(e, t, n, r) {
  const i = Math.max(Math.min(6, e.depth || 1), 1), s = n.createTracker(r);
  if (Qd(e, n)) {
    const c = n.enter("headingSetext"), f = n.enter("phrasing"), h = n.containerPhrasing(e, {
      ...s.current(),
      before: `
`,
      after: `
`
    });
    return f(), c(), h + `
` + (i === 1 ? "=" : "-").repeat(
      // The whole size…
      h.length - // Minus the position of the character after the last EOL (or
      // 0 if there is none)…
      (Math.max(h.lastIndexOf("\r"), h.lastIndexOf(`
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
  return /^[\t ]/.test(l) && (l = Nt(l.charCodeAt(0)) + l.slice(1)), l = l ? o + " " + l : o, n.options.closeAtx && (l += " " + o), u(), a(), l;
}
Ys.peek = Zd;
function Ys(e) {
  return e.value || "";
}
function Zd() {
  return "<";
}
Qs.peek = eh;
function Qs(e, t, n, r) {
  const i = mr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.enter("image");
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
function eh() {
  return "!";
}
Xs.peek = th;
function Xs(e, t, n, r) {
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
  const c = n.stack;
  n.stack = [], o = n.enter("reference");
  const f = n.safe(n.associationId(e), {
    before: u,
    after: "]",
    ...a.current()
  });
  return o(), n.stack = c, s(), i === "full" || !l || l !== f ? u += a.move(f + "]") : i === "shortcut" ? u = u.slice(0, -1) : u += a.move("]"), u;
}
function th() {
  return "!";
}
Zs.peek = nh;
function Zs(e, t, n) {
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
function nh() {
  return "`";
}
function eo(e, t) {
  const n = ar(e);
  return !!(!t.options.resourceLink && // If there’s a url…
  e.url && // And there’s a no title…
  !e.title && // And the content of `node` is a single text node…
  e.children && e.children.length === 1 && e.children[0].type === "text" && // And if the url is the same as the content…
  (n === e.url || "mailto:" + n === e.url) && // And that starts w/ a protocol…
  /^[a-z][a-z+.-]+:/i.test(e.url) && // And that doesn’t contain ASCII control codes (character escapes and
  // references don’t work), space, or angle brackets…
  !/[\0- <>\u007F]/.test(e.url));
}
to.peek = rh;
function to(e, t, n, r) {
  const i = mr(n), s = i === '"' ? "Quote" : "Apostrophe", o = n.createTracker(r);
  let a, u;
  if (eo(e, n)) {
    const c = n.stack;
    n.stack = [], a = n.enter("autolink");
    let f = o.move("<");
    return f += o.move(
      n.containerPhrasing(e, {
        before: f,
        after: ">",
        ...o.current()
      })
    ), f += o.move(">"), a(), n.stack = c, f;
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
function rh(e, t, n) {
  return eo(e, n) ? "<" : "[";
}
no.peek = ih;
function no(e, t, n, r) {
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
  const c = n.stack;
  n.stack = [], o = n.enter("reference");
  const f = n.safe(n.associationId(e), {
    before: u,
    after: "]",
    ...a.current()
  });
  return o(), n.stack = c, s(), i === "full" || !l || l !== f ? u += a.move(f + "]") : i === "shortcut" ? u = u.slice(0, -1) : u += a.move("]"), u;
}
function ih() {
  return "[";
}
function yr(e) {
  const t = e.options.bullet || "*";
  if (t !== "*" && t !== "+" && t !== "-")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bullet`, expected `*`, `+`, or `-`"
    );
  return t;
}
function sh(e) {
  const t = yr(e), n = e.options.bulletOther;
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
function oh(e) {
  const t = e.options.bulletOrdered || ".";
  if (t !== "." && t !== ")")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.bulletOrdered`, expected `.` or `)`"
    );
  return t;
}
function ro(e) {
  const t = e.options.rule || "*";
  if (t !== "*" && t !== "-" && t !== "_")
    throw new Error(
      "Cannot serialize rules with `" + t + "` for `options.rule`, expected `*`, `-`, or `_`"
    );
  return t;
}
function ah(e, t, n, r) {
  const i = n.enter("list"), s = n.bulletCurrent;
  let o = e.ordered ? oh(n) : yr(n);
  const a = e.ordered ? o === "." ? ")" : "." : sh(n);
  let u = t && n.bulletLastUsed ? o === n.bulletLastUsed : !1;
  if (!e.ordered) {
    const c = e.children ? e.children[0] : void 0;
    if (
      // Bullet could be used as a thematic break marker:
      (o === "*" || o === "-") && // Empty first list item:
      c && (!c.children || !c.children[0]) && // Directly in two other list items:
      n.stack[n.stack.length - 1] === "list" && n.stack[n.stack.length - 2] === "listItem" && n.stack[n.stack.length - 3] === "list" && n.stack[n.stack.length - 4] === "listItem" && // That are each the first child.
      n.indexStack[n.indexStack.length - 1] === 0 && n.indexStack[n.indexStack.length - 2] === 0 && n.indexStack[n.indexStack.length - 3] === 0 && (u = !0), ro(n) === o && c
    ) {
      let f = -1;
      for (; ++f < e.children.length; ) {
        const h = e.children[f];
        if (h && h.type === "listItem" && h.children && h.children[0] && h.children[0].type === "thematicBreak") {
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
function lh(e) {
  const t = e.options.listItemIndent || "one";
  if (t !== "tab" && t !== "one" && t !== "mixed")
    throw new Error(
      "Cannot serialize items with `" + t + "` for `options.listItemIndent`, expected `tab`, `one`, or `mixed`"
    );
  return t;
}
function uh(e, t, n, r) {
  const i = lh(n);
  let s = n.bulletCurrent || yr(n);
  t && t.type === "list" && t.ordered && (s = (typeof t.start == "number" && t.start > -1 ? t.start : 1) + (n.options.incrementListMarker === !1 ? 0 : t.children.indexOf(e)) + s);
  let o = s.length + 1;
  (i === "tab" || i === "mixed" && (t && t.type === "list" && t.spread || e.spread)) && (o = Math.ceil(o / 4) * 4);
  const a = n.createTracker(r);
  a.move(s + " ".repeat(o - s.length)), a.shift(o);
  const u = n.enter("listItem"), l = n.indentLines(
    n.containerFlow(e, a.current()),
    c
  );
  return u(), l;
  function c(f, h, d) {
    return h ? (d ? "" : " ".repeat(o)) + f : (d ? s : s + " ".repeat(o - s.length)) + f;
  }
}
function ch(e, t, n, r) {
  const i = n.enter("paragraph"), s = n.enter("phrasing"), o = n.containerPhrasing(e, r);
  return s(), i(), o;
}
const fh = (
  /** @type {(node?: unknown) => node is Exclude<PhrasingContent, Html>} */
  en([
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
function dh(e, t, n, r) {
  return (e.children.some(function(o) {
    return fh(o);
  }) ? n.containerPhrasing : n.containerFlow).call(n, e, r);
}
function hh(e) {
  const t = e.options.strong || "*";
  if (t !== "*" && t !== "_")
    throw new Error(
      "Cannot serialize strong with `" + t + "` for `options.strong`, expected `*`, or `_`"
    );
  return t;
}
io.peek = ph;
function io(e, t, n, r) {
  const i = hh(n), s = n.enter("strong"), o = n.createTracker(r), a = o.move(i + i);
  let u = o.move(
    n.containerPhrasing(e, {
      after: i,
      before: a,
      ...o.current()
    })
  );
  const l = u.charCodeAt(0), c = Gt(
    r.before.charCodeAt(r.before.length - 1),
    l,
    i
  );
  c.inside && (u = Nt(l) + u.slice(1));
  const f = u.charCodeAt(u.length - 1), h = Gt(r.after.charCodeAt(0), f, i);
  h.inside && (u = u.slice(0, -1) + Nt(f));
  const d = o.move(i + i);
  return s(), n.attentionEncodeSurroundingInfo = {
    after: h.outside,
    before: c.outside
  }, a + u + d;
}
function ph(e, t, n) {
  return n.options.strong || "*";
}
function gh(e, t, n, r) {
  return n.safe(e.value, r);
}
function mh(e) {
  const t = e.options.ruleRepetition || 3;
  if (t < 3)
    throw new Error(
      "Cannot serialize rules with repetition `" + t + "` for `options.ruleRepetition`, expected `3` or more"
    );
  return t;
}
function yh(e, t, n) {
  const r = (ro(n) + (n.options.ruleSpaces ? " " : "")).repeat(mh(n));
  return n.options.ruleSpaces ? r.slice(0, -1) : r;
}
const so = {
  blockquote: $d,
  break: _i,
  code: Kd,
  definition: Gd,
  emphasis: Js,
  hardBreak: _i,
  heading: Xd,
  html: Ys,
  image: Qs,
  imageReference: Xs,
  inlineCode: Zs,
  link: to,
  linkReference: no,
  list: ah,
  listItem: uh,
  paragraph: ch,
  root: dh,
  strong: io,
  text: gh,
  thematicBreak: yh
};
function bh() {
  return {
    enter: {
      table: xh,
      tableData: Fi,
      tableHeader: Fi,
      tableRow: vh
    },
    exit: {
      codeText: wh,
      table: kh,
      tableData: Tn,
      tableHeader: Tn,
      tableRow: Tn
    }
  };
}
function xh(e) {
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
function kh(e) {
  this.exit(e), this.data.inTable = void 0;
}
function vh(e) {
  this.enter({ type: "tableRow", children: [] }, e);
}
function Tn(e) {
  this.exit(e);
}
function Fi(e) {
  this.enter({ type: "tableCell", children: [] }, e);
}
function wh(e) {
  let t = this.resume();
  this.data.inTable && (t = t.replace(/\\([\\|])/g, Sh));
  const n = this.stack[this.stack.length - 1];
  n.type, n.value = t, this.exit(e);
}
function Sh(e, t) {
  return t === "|" ? t : e;
}
function Ch(e) {
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
      inlineCode: h,
      table: o,
      tableCell: u,
      tableRow: a
    }
  };
  function o(d, p, m, v) {
    return l(c(d, m, v), d.align);
  }
  function a(d, p, m, v) {
    const k = f(d, m, v), C = l([k]);
    return C.slice(0, C.indexOf(`
`));
  }
  function u(d, p, m, v) {
    const k = m.enter("tableCell"), C = m.enter("phrasing"), S = m.containerPhrasing(d, {
      ...v,
      before: s,
      after: s
    });
    return C(), k(), S;
  }
  function l(d, p) {
    return zd(d, {
      align: p,
      // @ts-expect-error: `markdown-table` types should support `null`.
      alignDelimiters: r,
      // @ts-expect-error: `markdown-table` types should support `null`.
      padding: n,
      // @ts-expect-error: `markdown-table` types should support `null`.
      stringLength: i
    });
  }
  function c(d, p, m) {
    const v = d.children;
    let k = -1;
    const C = [], S = p.enter("table");
    for (; ++k < v.length; )
      C[k] = f(v[k], p, m);
    return S(), C;
  }
  function f(d, p, m) {
    const v = d.children;
    let k = -1;
    const C = [], S = p.enter("tableRow");
    for (; ++k < v.length; )
      C[k] = u(v[k], d, p, m);
    return S(), C;
  }
  function h(d, p, m) {
    let v = so.inlineCode(d, p, m);
    return m.stack.includes("tableCell") && (v = v.replace(/\|/g, "\\$&")), v;
  }
}
function Eh() {
  return {
    exit: {
      taskListCheckValueChecked: Mi,
      taskListCheckValueUnchecked: Mi,
      paragraph: Nh
    }
  };
}
function Ih() {
  return {
    unsafe: [{ atBreak: !0, character: "-", after: "[:|-]" }],
    handlers: { listItem: Th }
  };
}
function Mi(e) {
  const t = this.stack[this.stack.length - 2];
  t.type, t.checked = e.type === "taskListCheckValueChecked";
}
function Nh(e) {
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
function Th(e, t, n, r) {
  const i = e.children[0], s = typeof e.checked == "boolean" && i && i.type === "paragraph", o = "[" + (e.checked ? "x" : " ") + "] ", a = n.createTracker(r);
  s && a.move(o);
  let u = so.listItem(e, t, n, {
    ...r,
    ...a.current()
  });
  return s && (u = u.replace(/^(?:[*+-]|\d+\.)([\r\n]| {1,3})/, l)), u;
  function l(c) {
    return c + o;
  }
}
function Lh() {
  return [
    ad(),
    Td(),
    Od(),
    bh(),
    Eh()
  ];
}
function Ah(e) {
  return {
    extensions: [
      ld(),
      Ld(e),
      Pd(),
      Ch(e),
      Ih()
    ]
  };
}
const Rh = {
  tokenize: Mh,
  partial: !0
}, oo = {
  tokenize: zh,
  partial: !0
}, ao = {
  tokenize: jh,
  partial: !0
}, lo = {
  tokenize: $h,
  partial: !0
}, Oh = {
  tokenize: Bh,
  partial: !0
}, uo = {
  name: "wwwAutolink",
  tokenize: _h,
  previous: fo
}, co = {
  name: "protocolAutolink",
  tokenize: Fh,
  previous: ho
}, De = {
  name: "emailAutolink",
  tokenize: Dh,
  previous: po
}, Le = {};
function Ph() {
  return {
    text: Le
  };
}
let Ve = 48;
for (; Ve < 123; )
  Le[Ve] = De, Ve++, Ve === 58 ? Ve = 65 : Ve === 91 && (Ve = 97);
Le[43] = De;
Le[45] = De;
Le[46] = De;
Le[95] = De;
Le[72] = [De, co];
Le[104] = [De, co];
Le[87] = [De, uo];
Le[119] = [De, uo];
function Dh(e, t, n) {
  const r = this;
  let i, s;
  return o;
  function o(f) {
    return !Wn(f) || !po.call(r, r.previous) || br(r.events) ? n(f) : (e.enter("literalAutolink"), e.enter("literalAutolinkEmail"), a(f));
  }
  function a(f) {
    return Wn(f) ? (e.consume(f), a) : f === 64 ? (e.consume(f), u) : n(f);
  }
  function u(f) {
    return f === 46 ? e.check(Oh, c, l)(f) : f === 45 || f === 95 || ue(f) ? (s = !0, e.consume(f), u) : c(f);
  }
  function l(f) {
    return e.consume(f), i = !0, u;
  }
  function c(f) {
    return s && i && fe(r.previous) ? (e.exit("literalAutolinkEmail"), e.exit("literalAutolink"), t(f)) : n(f);
  }
}
function _h(e, t, n) {
  const r = this;
  return i;
  function i(o) {
    return o !== 87 && o !== 119 || !fo.call(r, r.previous) || br(r.events) ? n(o) : (e.enter("literalAutolink"), e.enter("literalAutolinkWww"), e.check(Rh, e.attempt(oo, e.attempt(ao, s), n), n)(o));
  }
  function s(o) {
    return e.exit("literalAutolinkWww"), e.exit("literalAutolink"), t(o);
  }
}
function Fh(e, t, n) {
  const r = this;
  let i = "", s = !1;
  return o;
  function o(f) {
    return (f === 72 || f === 104) && ho.call(r, r.previous) && !br(r.events) ? (e.enter("literalAutolink"), e.enter("literalAutolinkHttp"), i += String.fromCodePoint(f), e.consume(f), a) : n(f);
  }
  function a(f) {
    if (fe(f) && i.length < 5)
      return i += String.fromCodePoint(f), e.consume(f), a;
    if (f === 58) {
      const h = i.toLowerCase();
      if (h === "http" || h === "https")
        return e.consume(f), u;
    }
    return n(f);
  }
  function u(f) {
    return f === 47 ? (e.consume(f), s ? l : (s = !0, u)) : n(f);
  }
  function l(f) {
    return f === null || qt(f) || X(f) || We(f) || Qt(f) ? n(f) : e.attempt(oo, e.attempt(ao, c), n)(f);
  }
  function c(f) {
    return e.exit("literalAutolinkHttp"), e.exit("literalAutolink"), t(f);
  }
}
function Mh(e, t, n) {
  let r = 0;
  return i;
  function i(o) {
    return (o === 87 || o === 119) && r < 3 ? (r++, e.consume(o), i) : o === 46 && r === 3 ? (e.consume(o), s) : n(o);
  }
  function s(o) {
    return o === null ? n(o) : t(o);
  }
}
function zh(e, t, n) {
  let r, i, s;
  return o;
  function o(l) {
    return l === 46 || l === 95 ? e.check(lo, u, a)(l) : l === null || X(l) || We(l) || l !== 45 && Qt(l) ? u(l) : (s = !0, e.consume(l), o);
  }
  function a(l) {
    return l === 95 ? r = !0 : (i = r, r = void 0), e.consume(l), o;
  }
  function u(l) {
    return i || r || !s ? n(l) : t(l);
  }
}
function jh(e, t) {
  let n = 0, r = 0;
  return i;
  function i(o) {
    return o === 40 ? (n++, e.consume(o), i) : o === 41 && r < n ? s(o) : o === 33 || o === 34 || o === 38 || o === 39 || o === 41 || o === 42 || o === 44 || o === 46 || o === 58 || o === 59 || o === 60 || o === 63 || o === 93 || o === 95 || o === 126 ? e.check(lo, t, s)(o) : o === null || X(o) || We(o) ? t(o) : (e.consume(o), i);
  }
  function s(o) {
    return o === 41 && r++, e.consume(o), i;
  }
}
function $h(e, t, n) {
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
    return fe(a) ? o(a) : n(a);
  }
  function o(a) {
    return a === 59 ? (e.consume(a), r) : fe(a) ? (e.consume(a), o) : n(a);
  }
}
function Bh(e, t, n) {
  return r;
  function r(s) {
    return e.consume(s), i;
  }
  function i(s) {
    return ue(s) ? n(s) : t(s);
  }
}
function fo(e) {
  return e === null || e === 40 || e === 42 || e === 95 || e === 91 || e === 93 || e === 126 || X(e);
}
function ho(e) {
  return !fe(e);
}
function po(e) {
  return !(e === 47 || Wn(e));
}
function Wn(e) {
  return e === 43 || e === 45 || e === 46 || e === 95 || ue(e);
}
function br(e) {
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
const Vh = {
  tokenize: Yh,
  partial: !0
};
function Hh() {
  return {
    document: {
      91: {
        name: "gfmFootnoteDefinition",
        tokenize: Wh,
        continuation: {
          tokenize: Gh
        },
        exit: Jh
      }
    },
    text: {
      91: {
        name: "gfmFootnoteCall",
        tokenize: Kh
      },
      93: {
        name: "gfmPotentialFootnoteCall",
        add: "after",
        tokenize: Uh,
        resolveTo: qh
      }
    }
  };
}
function Uh(e, t, n) {
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
    const l = Ie(r.sliceSerialize({
      start: o.end,
      end: r.now()
    }));
    return l.codePointAt(0) !== 94 || !s.includes(l.slice(1)) ? n(u) : (e.enter("gfmFootnoteCallLabelMarker"), e.consume(u), e.exit("gfmFootnoteCallLabelMarker"), t(u));
  }
}
function qh(e, t) {
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
function Kh(e, t, n) {
  const r = this, i = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let s = 0, o;
  return a;
  function a(f) {
    return e.enter("gfmFootnoteCall"), e.enter("gfmFootnoteCallLabelMarker"), e.consume(f), e.exit("gfmFootnoteCallLabelMarker"), u;
  }
  function u(f) {
    return f !== 94 ? n(f) : (e.enter("gfmFootnoteCallMarker"), e.consume(f), e.exit("gfmFootnoteCallMarker"), e.enter("gfmFootnoteCallString"), e.enter("chunkString").contentType = "string", l);
  }
  function l(f) {
    if (
      // Too long.
      s > 999 || // Closing brace with nothing.
      f === 93 && !o || // Space or tab is not supported by GFM for some reason.
      // `\n` and `[` not being supported makes sense.
      f === null || f === 91 || X(f)
    )
      return n(f);
    if (f === 93) {
      e.exit("chunkString");
      const h = e.exit("gfmFootnoteCallString");
      return i.includes(Ie(r.sliceSerialize(h))) ? (e.enter("gfmFootnoteCallLabelMarker"), e.consume(f), e.exit("gfmFootnoteCallLabelMarker"), e.exit("gfmFootnoteCall"), t) : n(f);
    }
    return X(f) || (o = !0), s++, e.consume(f), f === 92 ? c : l;
  }
  function c(f) {
    return f === 91 || f === 92 || f === 93 ? (e.consume(f), s++, l) : l(f);
  }
}
function Wh(e, t, n) {
  const r = this, i = r.parser.gfmFootnotes || (r.parser.gfmFootnotes = []);
  let s, o = 0, a;
  return u;
  function u(p) {
    return e.enter("gfmFootnoteDefinition")._container = !0, e.enter("gfmFootnoteDefinitionLabel"), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionLabelMarker"), l;
  }
  function l(p) {
    return p === 94 ? (e.enter("gfmFootnoteDefinitionMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionMarker"), e.enter("gfmFootnoteDefinitionLabelString"), e.enter("chunkString").contentType = "string", c) : n(p);
  }
  function c(p) {
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
      const m = e.exit("gfmFootnoteDefinitionLabelString");
      return s = Ie(r.sliceSerialize(m)), e.enter("gfmFootnoteDefinitionLabelMarker"), e.consume(p), e.exit("gfmFootnoteDefinitionLabelMarker"), e.exit("gfmFootnoteDefinitionLabel"), h;
    }
    return X(p) || (a = !0), o++, e.consume(p), p === 92 ? f : c;
  }
  function f(p) {
    return p === 91 || p === 92 || p === 93 ? (e.consume(p), o++, c) : c(p);
  }
  function h(p) {
    return p === 58 ? (e.enter("definitionMarker"), e.consume(p), e.exit("definitionMarker"), i.includes(s) || i.push(s), K(e, d, "gfmFootnoteDefinitionWhitespace")) : n(p);
  }
  function d(p) {
    return t(p);
  }
}
function Gh(e, t, n) {
  return e.check(Lt, t, e.attempt(Vh, t, n));
}
function Jh(e) {
  e.exit("gfmFootnoteDefinition");
}
function Yh(e, t, n) {
  const r = this;
  return K(e, i, "gfmFootnoteDefinitionIndent", 5);
  function i(s) {
    const o = r.events[r.events.length - 1];
    return o && o[1].type === "gfmFootnoteDefinitionIndent" && o[2].sliceSerialize(o[1], !0).length === 4 ? t(s) : n(s);
  }
}
function Qh(e) {
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
            const c = {
              type: "strikethrough",
              start: Object.assign({}, o[l][1].start),
              end: Object.assign({}, o[u][1].end)
            }, f = {
              type: "strikethroughText",
              start: Object.assign({}, o[l][1].end),
              end: Object.assign({}, o[u][1].start)
            }, h = [["enter", c, a], ["enter", o[l][1], a], ["exit", o[l][1], a], ["enter", f, a]], d = a.parser.constructs.insideSpan.null;
            d && xe(h, h.length, 0, Xt(d, o.slice(l + 1, u), a)), xe(h, h.length, 0, [["exit", f, a], ["enter", o[u][1], a], ["exit", o[u][1], a], ["exit", c, a]]), xe(o, l - 1, u - l + 3, h), u = l + h.length - 2;
            break;
          }
      }
    for (u = -1; ++u < o.length; )
      o[u][1].type === "strikethroughSequenceTemporary" && (o[u][1].type = "data");
    return o;
  }
  function s(o, a, u) {
    const l = this.previous, c = this.events;
    let f = 0;
    return h;
    function h(p) {
      return l === 126 && c[c.length - 1][1].type !== "characterEscape" ? u(p) : (o.enter("strikethroughSequenceTemporary"), d(p));
    }
    function d(p) {
      const m = st(l);
      if (p === 126)
        return f > 1 ? u(p) : (o.consume(p), f++, d);
      if (f < 2 && !n) return u(p);
      const v = o.exit("strikethroughSequenceTemporary"), k = st(p);
      return v._open = !k || k === 2 && !!m, v._close = !m || m === 2 && !!k, a(p);
    }
  }
}
class Xh {
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
    Zh(this, t, n, r);
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
function Zh(e, t, n, r) {
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
function ep(e, t) {
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
function tp() {
  return {
    flow: {
      null: {
        name: "table",
        tokenize: np,
        resolveAll: rp
      }
    }
  };
}
function np(e, t, n) {
  const r = this;
  let i = 0, s = 0, o;
  return a;
  function a(w) {
    let A = r.events.length - 1;
    for (; A > -1; ) {
      const _ = r.events[A][1].type;
      if (_ === "lineEnding" || // Note: markdown-rs uses `whitespace` instead of `linePrefix`
      _ === "linePrefix") A--;
      else break;
    }
    const D = A > -1 ? r.events[A][1].type : null, M = D === "tableHead" || D === "tableRow" ? x : u;
    return M === x && r.parser.lazy[r.now().line] ? n(w) : M(w);
  }
  function u(w) {
    return e.enter("tableHead"), e.enter("tableRow"), l(w);
  }
  function l(w) {
    return w === 124 || (o = !0, s += 1), c(w);
  }
  function c(w) {
    return w === null ? n(w) : z(w) ? s > 1 ? (s = 0, r.interrupt = !0, e.exit("tableRow"), e.enter("lineEnding"), e.consume(w), e.exit("lineEnding"), d) : n(w) : U(w) ? K(e, c, "whitespace")(w) : (s += 1, o && (o = !1, i += 1), w === 124 ? (e.enter("tableCellDivider"), e.consume(w), e.exit("tableCellDivider"), o = !0, c) : (e.enter("data"), f(w)));
  }
  function f(w) {
    return w === null || w === 124 || X(w) ? (e.exit("data"), c(w)) : (e.consume(w), w === 92 ? h : f);
  }
  function h(w) {
    return w === 92 || w === 124 ? (e.consume(w), f) : f(w);
  }
  function d(w) {
    return r.interrupt = !1, r.parser.lazy[r.now().line] ? n(w) : (e.enter("tableDelimiterRow"), o = !1, U(w) ? K(e, p, "linePrefix", r.parser.constructs.disable.null.includes("codeIndented") ? void 0 : 4)(w) : p(w));
  }
  function p(w) {
    return w === 45 || w === 58 ? v(w) : w === 124 ? (o = !0, e.enter("tableCellDivider"), e.consume(w), e.exit("tableCellDivider"), m) : L(w);
  }
  function m(w) {
    return U(w) ? K(e, v, "whitespace")(w) : v(w);
  }
  function v(w) {
    return w === 58 ? (s += 1, o = !0, e.enter("tableDelimiterMarker"), e.consume(w), e.exit("tableDelimiterMarker"), k) : w === 45 ? (s += 1, k(w)) : w === null || z(w) ? E(w) : L(w);
  }
  function k(w) {
    return w === 45 ? (e.enter("tableDelimiterFiller"), C(w)) : L(w);
  }
  function C(w) {
    return w === 45 ? (e.consume(w), C) : w === 58 ? (o = !0, e.exit("tableDelimiterFiller"), e.enter("tableDelimiterMarker"), e.consume(w), e.exit("tableDelimiterMarker"), S) : (e.exit("tableDelimiterFiller"), S(w));
  }
  function S(w) {
    return U(w) ? K(e, E, "whitespace")(w) : E(w);
  }
  function E(w) {
    return w === 124 ? p(w) : w === null || z(w) ? !o || i !== s ? L(w) : (e.exit("tableDelimiterRow"), e.exit("tableHead"), t(w)) : L(w);
  }
  function L(w) {
    return n(w);
  }
  function x(w) {
    return e.enter("tableRow"), R(w);
  }
  function R(w) {
    return w === 124 ? (e.enter("tableCellDivider"), e.consume(w), e.exit("tableCellDivider"), R) : w === null || z(w) ? (e.exit("tableRow"), t(w)) : U(w) ? K(e, R, "whitespace")(w) : (e.enter("data"), j(w));
  }
  function j(w) {
    return w === null || w === 124 || X(w) ? (e.exit("data"), R(w)) : (e.consume(w), w === 92 ? F : j);
  }
  function F(w) {
    return w === 92 || w === 124 ? (e.consume(w), j) : j(w);
  }
}
function rp(e, t) {
  let n = -1, r = !0, i = 0, s = [0, 0, 0, 0], o = [0, 0, 0, 0], a = !1, u = 0, l, c, f;
  const h = new Xh();
  for (; ++n < e.length; ) {
    const d = e[n], p = d[1];
    d[0] === "enter" ? p.type === "tableHead" ? (a = !1, u !== 0 && (zi(h, t, u, l, c), c = void 0, u = 0), l = {
      type: "table",
      start: Object.assign({}, p.start),
      // Note: correct end is set later.
      end: Object.assign({}, p.end)
    }, h.add(n, 0, [["enter", l, t]])) : p.type === "tableRow" || p.type === "tableDelimiterRow" ? (r = !0, f = void 0, s = [0, 0, 0, 0], o = [0, n + 1, 0, 0], a && (a = !1, c = {
      type: "tableBody",
      start: Object.assign({}, p.start),
      // Note: correct end is set later.
      end: Object.assign({}, p.end)
    }, h.add(n, 0, [["enter", c, t]])), i = p.type === "tableDelimiterRow" ? 2 : c ? 3 : 1) : i && (p.type === "data" || p.type === "tableDelimiterMarker" || p.type === "tableDelimiterFiller") ? (r = !1, o[2] === 0 && (s[1] !== 0 && (o[0] = o[1], f = Mt(h, t, s, i, void 0, f), s = [0, 0, 0, 0]), o[2] = n)) : p.type === "tableCellDivider" && (r ? r = !1 : (s[1] !== 0 && (o[0] = o[1], f = Mt(h, t, s, i, void 0, f)), s = o, o = [s[1], n, 0, 0])) : p.type === "tableHead" ? (a = !0, u = n) : p.type === "tableRow" || p.type === "tableDelimiterRow" ? (u = n, s[1] !== 0 ? (o[0] = o[1], f = Mt(h, t, s, i, n, f)) : o[1] !== 0 && (f = Mt(h, t, o, i, n, f)), i = 0) : i && (p.type === "data" || p.type === "tableDelimiterMarker" || p.type === "tableDelimiterFiller") && (o[3] = n);
  }
  for (u !== 0 && zi(h, t, u, l, c), h.consume(t.events), n = -1; ++n < t.events.length; ) {
    const d = t.events[n];
    d[0] === "enter" && d[1].type === "table" && (d[1]._align = ep(t.events, n));
  }
  return e;
}
function Mt(e, t, n, r, i, s) {
  const o = r === 1 ? "tableHeader" : r === 2 ? "tableDelimiter" : "tableData", a = "tableContent";
  n[0] !== 0 && (s.end = Object.assign({}, rt(t.events, n[0])), e.add(n[0], 0, [["exit", s, t]]));
  const u = rt(t.events, n[1]);
  if (s = {
    type: o,
    start: Object.assign({}, u),
    // Note: correct end is set later.
    end: Object.assign({}, u)
  }, e.add(n[1], 0, [["enter", s, t]]), n[2] !== 0) {
    const l = rt(t.events, n[2]), c = rt(t.events, n[3]), f = {
      type: a,
      start: Object.assign({}, l),
      end: Object.assign({}, c)
    };
    if (e.add(n[2], 0, [["enter", f, t]]), r !== 2) {
      const h = t.events[n[2]], d = t.events[n[3]];
      if (h[1].end = Object.assign({}, d[1].end), h[1].type = "chunkText", h[1].contentType = "text", n[3] > n[2] + 1) {
        const p = n[2] + 1, m = n[3] - n[2] - 1;
        e.add(p, m, []);
      }
    }
    e.add(n[3] + 1, 0, [["exit", f, t]]);
  }
  return i !== void 0 && (s.end = Object.assign({}, rt(t.events, i)), e.add(i, 0, [["exit", s, t]]), s = void 0), s;
}
function zi(e, t, n, r, i) {
  const s = [], o = rt(t.events, n);
  i && (i.end = Object.assign({}, o), s.push(["exit", i, t])), r.end = Object.assign({}, o), s.push(["exit", r, t]), e.add(n + 1, 0, s);
}
function rt(e, t) {
  const n = e[t], r = n[0] === "enter" ? "start" : "end";
  return n[1][r];
}
const ip = {
  name: "tasklistCheck",
  tokenize: op
};
function sp() {
  return {
    text: {
      91: ip
    }
  };
}
function op(e, t, n) {
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
    return z(u) ? t(u) : U(u) ? e.check({
      tokenize: ap
    }, t, n)(u) : n(u);
  }
}
function ap(e, t, n) {
  return K(e, r, "whitespace");
  function r(i) {
    return i === null ? n(i) : t(i);
  }
}
function lp(e) {
  return Ss([
    Ph(),
    Hh(),
    Qh(e),
    tp(),
    sp()
  ]);
}
const up = {};
function cp(e) {
  const t = (
    /** @type {Processor<Root>} */
    this
  ), n = e || up, r = t.data(), i = r.micromarkExtensions || (r.micromarkExtensions = []), s = r.fromMarkdownExtensions || (r.fromMarkdownExtensions = []), o = r.toMarkdownExtensions || (r.toMarkdownExtensions = []);
  i.push(lp(n)), s.push(Lh()), o.push(Ah(n));
}
const fp = {
  a: ({ node: e, ...t }) => /* @__PURE__ */ g("a", { target: "_blank", rel: "noopener noreferrer", ...t }),
  // react-markdown v10 removed the `inline` prop; detect inline via the absence
  // of a language- className and of newlines (block code lives inside <pre>).
  code: ({ node: e, className: t, children: n, ...r }) => !/^language-/.test(t || "") && !String(n).includes(`
`) ? /* @__PURE__ */ g("code", { className: "fdv2-md-code-inline", ...r, children: n }) : /* @__PURE__ */ g("code", { className: t, ...r, children: n }),
  table: ({ node: e, ...t }) => /* @__PURE__ */ g("div", { className: "fdv2-md-table-wrap", children: /* @__PURE__ */ g("table", { ...t }) })
};
function dp({ children: e }) {
  return /* @__PURE__ */ g("div", { className: "fdv2-md", children: /* @__PURE__ */ g(Qf, { remarkPlugins: [cp], components: fp, children: e || "" }) });
}
function Ln(e, t) {
  return t ? e === "beneficiary" ? `${t.name || t.userId}${t.email ? ` (${t.email})` : ""}` : t.name || t.code || "" : "";
}
function hp({ resolveChoices: e }) {
  const { t } = ee(), { loading: n } = we(), r = Pe(), [i, s] = re(null), [o, a] = re(""), { slotId: u, default: l, alternatives: c = [], allowSearch: f } = e, h = () => r.sendChoice({ slotId: u, action: "confirm", value: l }, Ln(u, l)), d = (m) => r.sendChoice({ slotId: u, action: "select", value: m }, Ln(u, m)), p = () => {
    const m = o.trim();
    m && r.sendChoice({ slotId: u, action: "search", value: m }, m);
  };
  return /* @__PURE__ */ N("div", { className: "fdv2-choice", children: [
    /* @__PURE__ */ N("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", onClick: h, disabled: n, children: t("choice.yes") }),
      c.length > 0 && /* @__PURE__ */ N("button", { type: "button", className: "fdv2-choice-btn", onClick: () => s(i === "list" ? null : "list"), disabled: n, children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      f && /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", onClick: () => s(i === "search" ? null : "search"), disabled: n, children: t("choice.search") })
    ] }),
    i === "list" && /* @__PURE__ */ g("ul", { className: "fdv2-choice-list", children: c.map((m, v) => /* @__PURE__ */ g("li", { children: /* @__PURE__ */ g("button", { type: "button", onClick: () => d(m), disabled: n, children: Ln(u, m) }) }, m.userId || m.code || v)) }),
    i === "search" && /* @__PURE__ */ N("div", { className: "fdv2-choice-search", children: [
      /* @__PURE__ */ g(
        "input",
        {
          className: "fdv2-slot-input",
          value: o,
          onChange: (m) => a(m.target.value),
          onKeyDown: (m) => {
            m.key === "Enter" && (m.preventDefault(), p());
          },
          placeholder: t(u === "location" ? "choice.searchLocation" : "choice.searchUser"),
          disabled: n,
          autoFocus: !0
        }
      ),
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", onClick: p, disabled: n || !o.trim(), children: t("choice.find") })
    ] })
  ] });
}
function ji({ control: e, onPick: t, onCommit: n }) {
  const { t: r } = ee(), { loading: i } = we(), s = e.source || {}, o = s.minChars || 2, a = s.directory || "user", u = e.multi === !0, [l, c] = re(() => Array.isArray(e.selected) ? e.selected : []), f = (x) => l.some((R) => String(R.value ?? R.userId ?? R.id) === String(x.value)), [h, d] = re(""), [p, m] = re([]), [v, k] = re(!1), C = oe(null);
  ne(() => {
    const x = h.trim();
    if (x.length < o) {
      m([]), k(!1);
      return;
    }
    return k(!0), clearTimeout(C.current), C.current = setTimeout(async () => {
      try {
        const j = await (await Ge()(
          Zn(`/flowdesk/directory/${encodeURIComponent(a)}?q=${encodeURIComponent(x)}&limit=8`),
          { headers: await ze() }
        )).json().catch(() => ({}));
        m(Array.isArray(j.results) ? j.results : []);
      } catch {
        m([]);
      } finally {
        k(!1);
      }
    }, 300), () => clearTimeout(C.current);
  }, [h, o, a]);
  const S = s.placeholder || r(a === "location" ? "choice.searchLocation" : "choice.searchUser"), E = (x) => {
    if (!u) {
      t(x);
      return;
    }
    f(x) || c([...l, x]), d(""), m([]);
  }, L = (x) => c(l.filter((R) => String(R.value ?? R.userId ?? R.id) !== String(x)));
  return /* @__PURE__ */ N("div", { className: "fdv2-autocomplete fdv2-choice-search", children: [
    u && l.length > 0 && /* @__PURE__ */ g("ul", { className: "fdv2-ac-chips", children: l.map((x) => {
      const R = x.value ?? x.userId ?? x.id;
      return /* @__PURE__ */ N("li", { className: "fdv2-ac-chip", children: [
        /* @__PURE__ */ g("span", { children: x.label || x.name || R }),
        /* @__PURE__ */ g("button", { type: "button", "aria-label": r("choice.cancel"), disabled: i, onClick: () => L(R), children: "✕" })
      ] }, R);
    }) }),
    /* @__PURE__ */ g(
      "input",
      {
        className: "fdv2-slot-input",
        value: h,
        onChange: (x) => d(x.target.value),
        placeholder: S,
        disabled: i,
        autoFocus: !0
      }
    ),
    v && /* @__PURE__ */ g("span", { className: "fdv2-ac-loading", "aria-hidden": "true", children: "…" }),
    p.length > 0 && /* @__PURE__ */ g("ul", { className: "fdv2-choice-list", children: p.map((x) => /* @__PURE__ */ g("li", { children: /* @__PURE__ */ N("button", { type: "button", disabled: i || u && f(x), onClick: () => E(x), children: [
      x.label,
      x.sublabel ? ` — ${x.sublabel}` : ""
    ] }) }, x.value)) }),
    u && /* @__PURE__ */ g("div", { className: "fdv2-ac-actions", children: /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: "fdv2-choice-btn fdv2-choice-confirm",
        disabled: i,
        onClick: () => n(l),
        children: l.length ? r("choice.done", { count: l.length }) : r("choice.skip")
      }
    ) })
  ] });
}
function pp({ control: e, onSelect: t }) {
  const { t: n } = ee(), { loading: r } = we(), [i, s] = re(e.prefill || "");
  return /* @__PURE__ */ N("div", { className: "fdv2-date-control fdv2-choice-row", children: [
    /* @__PURE__ */ g(
      "input",
      {
        type: "date",
        className: "fdv2-slot-input fdv2-date-input",
        value: i,
        onChange: (a) => s(a.target.value),
        disabled: r
      }
    ),
    /* @__PURE__ */ g(
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
function gp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = we(), i = e.options || [], [s, o] = re(() => new Set(e.selected || [])), a = (l) => {
    o((c) => {
      const f = new Set(c);
      return f.has(l) ? f.delete(l) : f.add(l), f;
    });
  }, u = () => {
    const l = i.map((c) => c.value).filter((c) => s.has(c));
    l.length && t(l);
  };
  return /* @__PURE__ */ N("div", { className: "fdv2-multichoice-control", children: [
    /* @__PURE__ */ g("ul", { className: "fdv2-multichoice-list", children: i.map((l) => /* @__PURE__ */ g("li", { className: "fdv2-multichoice-option", children: /* @__PURE__ */ N("label", { children: [
      /* @__PURE__ */ g(
        "input",
        {
          type: "checkbox",
          checked: s.has(l.value),
          disabled: r,
          onChange: () => a(l.value)
        }
      ),
      /* @__PURE__ */ N("span", { children: [
        l.label,
        l.description ? ` — ${l.description}` : ""
      ] })
    ] }) }, l.value)) }),
    /* @__PURE__ */ N("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-choice-btn fdv2-choice-confirm",
          disabled: r || s.size === 0,
          onClick: u,
          children: n("multichoice.confirm")
        }
      ),
      s.size > 0 && /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: r, onClick: () => o(/* @__PURE__ */ new Set()), children: n("multichoice.clear") })
    ] })
  ] });
}
function mp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = we(), { type: i, placeholder: s, prefill: o, rows: a } = e, [u, l] = re(o != null ? String(o) : ""), c = i === "textarea", f = !r && String(u).trim() !== "", h = () => {
    f && t(u);
  }, p = {
    className: "fdv2-slot-input",
    value: u,
    placeholder: s || void 0,
    disabled: r,
    onChange: (m) => l(m.target.value),
    onKeyDown: (m) => {
      m.key === "Enter" && (c && !(m.ctrlKey || m.metaKey) || (m.preventDefault(), h()));
    }
  };
  return /* @__PURE__ */ N("div", { className: `fdv2-freeinput-control fdv2-freeinput-${i}`, children: [
    c ? /* @__PURE__ */ g("textarea", { ...p, rows: a || 4 }) : /* @__PURE__ */ g("input", { ...p, type: i === "number" ? "number" : "text" }),
    /* @__PURE__ */ g("div", { className: "fdv2-choice-row", children: /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: "fdv2-choice-btn fdv2-choice-confirm",
        disabled: !f,
        onClick: h,
        children: n("freeInput.submit")
      }
    ) })
  ] });
}
function yp({ control: e, onCommit: t }) {
  const { t: n } = ee(), { loading: r } = we(), i = e.prefill;
  return /* @__PURE__ */ N("div", { className: "fdv2-toggle-control fdv2-choice-row", children: [
    /* @__PURE__ */ g(
      "button",
      {
        type: "button",
        className: `fdv2-choice-btn ${i === !0 ? "fdv2-choice-confirm" : ""}`,
        disabled: r,
        onClick: () => t(!0),
        children: n("toggle.on")
      }
    ),
    /* @__PURE__ */ g(
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
function bp({ control: e, onAccept: t, onEdit: n }) {
  const { t: r } = ee(), { loading: i } = we(), s = e.fields || [];
  return /* @__PURE__ */ N("div", { className: "fdv2-cascade-control", children: [
    /* @__PURE__ */ g("dl", { className: "fdv2-cascade-list", children: s.map((o) => /* @__PURE__ */ N("div", { className: "fdv2-cascade-row", children: [
      /* @__PURE__ */ g("dt", { children: o.label }),
      /* @__PURE__ */ g("dd", { children: o.display })
    ] }, o.slotId)) }),
    /* @__PURE__ */ N("div", { className: "fdv2-choice-row", children: [
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn fdv2-choice-confirm", disabled: i, onClick: t, children: r("cascade.accept") }),
      /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: i, onClick: n, children: r("cascade.edit") })
    ] })
  ] });
}
const xp = ["text", "textarea", "number"], $i = (e) => `${e.label}${e.description ? ` — ${e.description}` : ""}`;
function zt(e, t) {
  return e === "location" ? { code: t.value, name: t.label } : { userId: t.value, name: t.label, ...t.meta && t.meta.email ? { email: t.meta.email } : {} };
}
function go({ control: e }) {
  const { t } = ee(), { loading: n } = we(), r = Pe(), [i, s] = re(null), { id: o, type: a, slotId: u, label: l, defaultValue: c, options: f = [], children: h = [], showChildrenOn: d } = e, p = (x, R, j) => r.sendControlAction({ controlId: o, slotId: u, action: x, value: R }, j), m = d === "_search" && h.some((x) => x.type === "autocomplete"), v = c && typeof c == "object" ? c : null, k = v && (v.name || v.label || [v.firstName, v.lastName].filter(Boolean).join(" ")) || null, C = m && i === "_search", S = C || i != null && i !== "list" && i === d ? h : [], E = (x) => x.type === "autocomplete" ? /* @__PURE__ */ g(
    ji,
    {
      control: { ...x, multi: e.multi === !0, selected: e.selected },
      onPick: (R) => p("submit", zt(x.source?.directory, R), R.label),
      onCommit: (R) => p(
        "submit",
        R.map((j) => zt(x.source?.directory, j)),
        R.map((j) => j.label || j.name).join(", ") || void 0
      )
    },
    x.id
  ) : /* @__PURE__ */ g("div", { className: "fdv2-control-child", children: /* @__PURE__ */ g(go, { control: x }) }, x.id), L = (x) => {
    if (h.length && d === x.value) {
      s(i === x.value ? null : x.value);
      return;
    }
    p("select", x.value, x.label);
  };
  return /* @__PURE__ */ N("div", { className: "fdv2-control", children: [
    l && a !== "autocomplete" && (a !== "confirm" || !!k) && /* @__PURE__ */ g("div", { className: "fdv2-control-label", children: l }),
    /* @__PURE__ */ N("div", { className: "fdv2-choice-row", children: [
      a === "confirm" && /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-choice-btn fdv2-choice-confirm",
          disabled: n,
          onClick: () => p("confirm", void 0, k || t("choice.yes")),
          children: k || t("choice.yes")
        }
      ),
      a === "choice" && f.map((x) => /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => L(x), children: $i(x) }, x.value)),
      a === "confirm" && f.length > 0 && /* @__PURE__ */ N("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => s(i === "list" ? null : "list"), children: [
        t("choice.chooseOther"),
        " ▾"
      ] }),
      a === "confirm" && m && !C && /* @__PURE__ */ g("button", { type: "button", className: "fdv2-choice-btn", disabled: n, onClick: () => s("_search"), children: t("choice.search") }),
      a === "confirm" && C && /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-choice-btn fdv2-choice-cancel",
          disabled: n,
          title: t("choice.cancel"),
          "aria-label": t("choice.cancel"),
          onClick: () => s(null),
          children: "✕"
        }
      )
    ] }),
    a === "confirm" && i === "list" && /* @__PURE__ */ g("ul", { className: "fdv2-choice-list", children: f.map((x) => /* @__PURE__ */ g("li", { children: /* @__PURE__ */ g("button", { type: "button", disabled: n, onClick: () => p("select", x.value, x.label), children: $i(x) }) }, x.value)) }),
    a === "autocomplete" && /* @__PURE__ */ g(
      ji,
      {
        control: e,
        onPick: (x) => p("submit", zt(e.source?.directory, x), x.label),
        onCommit: (x) => p(
          "submit",
          x.map((R) => zt(e.source?.directory, R)),
          x.map((R) => R.label || R.name).join(", ") || void 0
        )
      }
    ),
    a === "date" && /* @__PURE__ */ g(pp, { control: e, onSelect: (x) => p("date_select", x, x) }),
    a === "multichoice" && /* @__PURE__ */ g(
      gp,
      {
        control: e,
        onCommit: (x) => r.sendControlAction({ controlId: o, slotId: u, action: "multichoice_select", values: x }, x.join(", "))
      }
    ),
    xp.includes(a) && /* @__PURE__ */ g(
      mp,
      {
        control: e,
        onCommit: (x) => p(a === "number" ? "number_input" : "text_input", x, String(x))
      }
    ),
    a === "cascade_confirm" && /* @__PURE__ */ g(
      bp,
      {
        control: e,
        onAccept: () => p("cascade_accept", void 0, t("cascade.accept")),
        onEdit: () => p("cascade_edit", void 0, t("cascade.edit"))
      }
    ),
    a === "toggle" && /* @__PURE__ */ g(yp, { control: e, onCommit: (x) => p("toggle_input", x, t(x ? "toggle.on" : "toggle.off")) }),
    S.map(E)
  ] });
}
function kp({ controls: e }) {
  return !Array.isArray(e) || e.length === 0 ? null : /* @__PURE__ */ g("div", { className: "fdv2-controls", children: e.map((t) => /* @__PURE__ */ g(go, { control: t }, t.id)) });
}
function vp(e, t, n) {
  if (t !== "date") return e;
  const r = new Date(e);
  if (Number.isNaN(r.getTime())) return e;
  try {
    return r.toLocaleDateString(n || void 0, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return e;
  }
}
function wp({ card: e, onOpen: t }) {
  const { i18n: n } = ee(), r = !!(e.revealIntent && t), i = () => {
    r && t(e.revealIntent);
  };
  return /* @__PURE__ */ N(
    "li",
    {
      className: `fdv2-card${r ? " fdv2-card-clickable" : ""}`,
      ...r ? {
        role: "button",
        tabIndex: 0,
        onClick: i,
        onKeyDown: (s) => {
          (s.key === "Enter" || s.key === " ") && (s.preventDefault(), i());
        }
      } : {},
      children: [
        e.accent && /* @__PURE__ */ g("span", { className: "fdv2-card-accent", "data-accent": String(e.accent).toLowerCase(), "aria-hidden": "true" }),
        /* @__PURE__ */ N("div", { className: "fdv2-card-body", children: [
          /* @__PURE__ */ N("div", { className: "fdv2-card-head", children: [
            /* @__PURE__ */ g("span", { className: "fdv2-card-title", children: e.title }),
            e.subtitle && /* @__PURE__ */ g("span", { className: "fdv2-card-sub", children: e.subtitle })
          ] }),
          /* @__PURE__ */ g("dl", { className: "fdv2-card-fields", children: (e.fields || []).map((s) => /* @__PURE__ */ N("div", { className: "fdv2-card-field", children: [
            /* @__PURE__ */ g("dt", { children: s.label }),
            /* @__PURE__ */ g("dd", { children: vp(s.value, s.format, n.language) })
          ] }, s.label)) })
        ] })
      ]
    }
  );
}
function Sp({ cards: e }) {
  if (!Array.isArray(e) || !e.length) return null;
  const t = ve().onReveal || null;
  return /* @__PURE__ */ g("ul", { className: "fdv2-cards", children: e.map((n) => /* @__PURE__ */ g(wp, { card: n, onOpen: t }, `${n.type}-${n.id}`)) });
}
function Cp() {
  return /* @__PURE__ */ N(
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
        /* @__PURE__ */ g("path", { d: "M12 20h9" }),
        /* @__PURE__ */ g("path", { d: "M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" })
      ]
    }
  );
}
function Ep({ review: e, interactive: t = !0 }) {
  const { t: n } = ee(), { loading: r } = we(), i = Pe();
  if (!e || !Array.isArray(e.groups) || e.groups.length === 0) return null;
  const s = (o) => i.sendControlAction({ slotId: o.slotId, action: "edit" }, n("review.editEcho", { field: o.label }));
  return /* @__PURE__ */ g("div", { className: "fdv2-review", role: "table", "aria-label": e.title || n("review.title"), children: e.groups.map((o) => /* @__PURE__ */ N("div", { className: "fdv2-review-group", role: "rowgroup", children: [
    /* @__PURE__ */ g("div", { className: "fdv2-review-section", children: o.label }),
    o.rows.map((a) => /* @__PURE__ */ N("div", { className: "fdv2-review-row", role: "row", children: [
      /* @__PURE__ */ g("span", { className: "fdv2-review-label", role: "cell", children: a.label }),
      /* @__PURE__ */ g("span", { className: "fdv2-review-value", role: "cell", children: String(a.display ?? "") }),
      /* @__PURE__ */ g("span", { className: "fdv2-review-action", role: "cell", children: t && a.editable && /* @__PURE__ */ g(
        "button",
        {
          type: "button",
          className: "fdv2-review-edit",
          disabled: r,
          title: n("review.edit"),
          "aria-label": n("review.editField", { field: a.label }),
          onClick: () => s(a),
          children: /* @__PURE__ */ g(Cp, {})
        }
      ) })
    ] }, a.slotId))
  ] }, o.section)) });
}
function Ip({ open: e, sources: t, onClose: n }) {
  const { t: r } = ee();
  if (ne(() => {
    if (!e) return;
    const s = (o) => {
      o.key === "Escape" && n();
    };
    return document.addEventListener("keydown", s), () => document.removeEventListener("keydown", s);
  }, [e, n]), !e) return null;
  const i = Array.isArray(t) ? t : [];
  return /* @__PURE__ */ g("div", { className: "fdv2-sources-overlay", role: "presentation", onClick: n, children: /* @__PURE__ */ N(
    "div",
    {
      className: "fdv2-sources-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-label": r("sources.title"),
      onClick: (s) => s.stopPropagation(),
      children: [
        /* @__PURE__ */ N("div", { className: "fdv2-sources-head", children: [
          /* @__PURE__ */ g("h3", { className: "fdv2-sources-title", children: r("sources.title") }),
          /* @__PURE__ */ g(
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
        /* @__PURE__ */ g("ul", { className: "fdv2-sources-list", children: i.map((s) => /* @__PURE__ */ N("li", { className: "fdv2-source-item", children: [
          /* @__PURE__ */ N("div", { className: "fdv2-source-row", children: [
            /* @__PURE__ */ g("span", { className: "fdv2-source-name", children: s.title }),
            typeof s.relevance == "number" && /* @__PURE__ */ N(
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
          s.collection && /* @__PURE__ */ N("div", { className: "fdv2-source-collection", children: [
            r("sources.collection"),
            ": ",
            s.collection
          ] }),
          s.snippet && /* @__PURE__ */ g("p", { className: "fdv2-source-snippet", children: s.snippet })
        ] }, s.id)) })
      ]
    }
  ) });
}
function Np() {
  return /* @__PURE__ */ N(
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
        /* @__PURE__ */ g("path", { d: "M5 12h14" }),
        /* @__PURE__ */ g("path", { d: "M13 6l6 6-6 6" })
      ]
    }
  );
}
function Tp({ navigate: e, onNavigate: t }) {
  const { t: n } = ee();
  return !e || !e.path || typeof t != "function" ? null : /* @__PURE__ */ N(
    "button",
    {
      type: "button",
      className: "fdv2-navigate-link",
      onClick: () => t(e),
      "aria-label": n("navigate.goTo", { path: e.path }),
      children: [
        /* @__PURE__ */ g(Np, {}),
        n("navigate.goThere")
      ]
    }
  );
}
function Lp() {
  return /* @__PURE__ */ N(
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
        /* @__PURE__ */ g("path", { d: "M4 5a2 2 0 0 1 2-2h11a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2z" }),
        /* @__PURE__ */ g("path", { d: "M4 19a2 2 0 0 1 2-2h12" })
      ]
    }
  );
}
function Ap() {
  return /* @__PURE__ */ N(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.9",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("path", { d: "M12 19v3" }),
        /* @__PURE__ */ g("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
        /* @__PURE__ */ g("rect", { x: "9", y: "2", width: "6", height: "13", rx: "3" })
      ]
    }
  );
}
function Rp() {
  return /* @__PURE__ */ g(
    "svg",
    {
      width: "13",
      height: "13",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "1.9",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: /* @__PURE__ */ g("path", { d: "M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" })
    }
  );
}
const Op = { "voice-error": Ap, "chat-error": Rp };
function Pp(e, t, n) {
  if (!e) return { label: "", full: "" };
  const r = new Date(e), i = r.toLocaleString(n), s = Date.now() - r.getTime();
  return s < 6e4 ? { label: t("time.justNow"), full: i } : s < 36e5 ? { label: t("time.minutesAgo", { count: Math.floor(s / 6e4) }), full: i } : { label: r.toLocaleTimeString(n, { hour: "2-digit", minute: "2-digit" }), full: i };
}
function Dp({ message: e, isLast: t, onNavigate: n, userAvatar: r, assistantAvatar: i }) {
  const { t: s, i18n: o } = ee(), { role: a, content: u, timestamp: l, metadata: c } = e, f = Pp(l, s, o.language), h = t && a === "assistant" && Array.isArray(c?.controls) && c.controls.length > 0, d = a === "assistant" && Array.isArray(c?.cards) ? c.cards : null, p = !h && t && a === "assistant" && c?.responseType === "confirm_or_choose" && c?.resolveChoices;
  if (a === "system") {
    const E = Op[c?.kind], L = !!c?.kind;
    return /* @__PURE__ */ N("div", { className: `fdv2-message fdv2-message-system${L ? " fdv2-message-system--with-avatar" : ""}`, children: [
      L && /* @__PURE__ */ g("div", { className: "fdv2-avatar fdv2-avatar-assistant", "aria-hidden": "true", children: i || E && /* @__PURE__ */ g(E, {}) }),
      /* @__PURE__ */ g("span", { className: `fdv2-system-pill${c?.debugDetail ? " fdv2-system-pill--debug" : ""}`, children: /* @__PURE__ */ N("span", { className: "fdv2-system-text-col", children: [
        /* @__PURE__ */ g("span", { className: "fdv2-system-text", children: u }),
        c?.debugDetail && /* @__PURE__ */ N("span", { className: "fdv2-system-debug", children: [
          "[dev] ",
          c.debugDetail
        ] })
      ] }) })
    ] });
  }
  const m = a === "user", v = c?.executionLog, k = Array.isArray(c?.sources) ? c.sources : [], [C, S] = Me.useState(!1);
  return /* @__PURE__ */ N("div", { className: `fdv2-message ${m ? "fdv2-message-user" : "fdv2-message-assistant"}`, children: [
    !m && /* @__PURE__ */ g("div", { className: `fdv2-avatar${i ? " fdv2-avatar-assistant" : ""}`, "aria-hidden": "true", children: i || "◆" }),
    /* @__PURE__ */ N("div", { className: "fdv2-bubble-col", children: [
      !(m && r) && /* @__PURE__ */ g("span", { className: "fdv2-sender", children: s(m ? "senderMe" : "agentName") }),
      !m && c?.preamble && /* @__PURE__ */ g("p", { className: "fdv2-preamble", children: c.preamble }),
      /* @__PURE__ */ g("div", { className: "fdv2-bubble", children: m ? /* @__PURE__ */ g("span", { className: "fdv2-user-text", children: u }) : /* @__PURE__ */ g(dp, { children: u }) }),
      !m && c?.review && /* @__PURE__ */ g(Ep, { review: c.review, interactive: t }),
      d && d.length > 0 && /* @__PURE__ */ g(Sp, { cards: d }),
      h && /* @__PURE__ */ g(kp, { controls: c.controls }),
      p && /* @__PURE__ */ g(hp, { resolveChoices: c.resolveChoices }),
      !m && c?.navigate && /* @__PURE__ */ g(Tp, { navigate: c.navigate, onNavigate: n }),
      /* @__PURE__ */ N("div", { className: "fdv2-message-meta", children: [
        /* @__PURE__ */ g("time", { dateTime: l, title: f.full, children: f.label }),
        c?.srNumber && /* @__PURE__ */ g("span", { className: "fdv2-sr-chip", children: c.srNumber }),
        Array.isArray(v) && v.length > 0 && /* @__PURE__ */ N("details", { className: "fdv2-exec-log", children: [
          /* @__PURE__ */ g("summary", { children: s("meta.details", { count: v.length }) }),
          /* @__PURE__ */ g("ol", { children: v.map((E, L) => /* @__PURE__ */ g("li", { className: E.status === "error" ? "err" : "", children: E.node }, L)) })
        ] }),
        !m && k.length > 0 && /* @__PURE__ */ N(
          "button",
          {
            type: "button",
            className: "fdv2-sources-btn",
            title: s("sources.view"),
            "aria-label": s("sources.view"),
            onClick: () => S(!0),
            children: [
              /* @__PURE__ */ g(Lp, {}),
              /* @__PURE__ */ g("span", { className: "fdv2-sources-count", children: k.length })
            ]
          }
        )
      ] })
    ] }),
    m && r && /* @__PURE__ */ g("div", { className: "fdv2-avatar fdv2-avatar-user", "aria-hidden": "true", children: r }),
    !m && k.length > 0 && /* @__PURE__ */ g(Ip, { open: C, sources: k, onClose: () => S(!1) })
  ] });
}
function _p({ children: e, emptyState: t, onNavigate: n, userAvatar: r, assistantAvatar: i }) {
  const { t: s } = ee(), o = os(), a = Pe(), u = oe(null), l = oe(null), c = oe(0);
  ne(() => {
    const h = u.current;
    if (!h) return;
    const d = o.length > c.current;
    if (c.current = o.length, !d) return;
    const p = h.scrollHeight - h.scrollTop - h.clientHeight < 120, m = o[o.length - 1];
    (p || m?.role === "assistant" || m?.role === "system") && l.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [o]);
  const f = () => {
    window.confirm(s("resetConfirm")) && a.resetSession();
  };
  return /* @__PURE__ */ N("div", { className: "fdv2-messages-wrap", children: [
    /* @__PURE__ */ g("div", { className: "fdv2-messages", ref: u, children: /* @__PURE__ */ N("div", { className: "fdv2-messages-inner", children: [
      o.length === 0 ? (
        // Host-injectable pre-conversation slot; falls back to a bare greeting.
        t != null ? /* @__PURE__ */ g("div", { className: "fdv2-empty fdv2-empty-custom", children: t }) : /* @__PURE__ */ N("div", { className: "fdv2-empty", children: [
          /* @__PURE__ */ g("div", { className: "fdv2-empty-icon", children: "◆" }),
          /* @__PURE__ */ g("h2", { children: s("emptyTitle") })
        ] })
      ) : o.map((h, d) => /* @__PURE__ */ g(Dp, { message: h, isLast: d === o.length - 1, onNavigate: n, userAvatar: r, assistantAvatar: i }, h.id)),
      e,
      /* @__PURE__ */ g("div", { ref: l })
    ] }) }),
    o.length > 0 && /* @__PURE__ */ N(
      "button",
      {
        type: "button",
        className: "fdv2-newchat",
        onClick: f,
        title: s("newChat"),
        "aria-label": s("newChat"),
        children: [
          /* @__PURE__ */ N("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
            /* @__PURE__ */ g("path", { d: "M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" }),
            /* @__PURE__ */ g("path", { d: "M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" })
          ] }),
          /* @__PURE__ */ g("span", { className: "fdv2-newchat-label", children: s("newChat") })
        ]
      }
    )
  ] });
}
const Fp = 24e3, Mp = `
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
function zp(e) {
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
class jp {
  constructor({ onFrame: t } = {}) {
    this.onFrame = t, this.ctx = null, this.stream = null, this.node = null, this.source = null;
  }
  /** Request the mic and start streaming frames. Throws if permission denied. */
  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: !0, noiseSuppression: !0, autoGainControl: !0 }
    });
    const t = window.AudioContext || window.webkitAudioContext;
    this.ctx = new t({ sampleRate: Fp }), this.ctx.state === "suspended" && await this.ctx.resume();
    const n = URL.createObjectURL(new Blob([Mp], { type: "application/javascript" }));
    try {
      await this.ctx.audioWorklet.addModule(n);
    } finally {
      URL.revokeObjectURL(n);
    }
    this.source = this.ctx.createMediaStreamSource(this.stream), this.node = new AudioWorkletNode(this.ctx, "fdv2-capture"), this.node.port.onmessage = (r) => {
      this.onFrame && this.onFrame(zp(r.data));
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
const Bi = 24e3;
function $p(e) {
  const t = atob(e), n = t.length, r = new Uint8Array(n);
  for (let i = 0; i < n; i++) r[i] = t.charCodeAt(i);
  return new Int16Array(r.buffer, 0, n >> 1);
}
function Bp(e) {
  const t = new Float32Array(e.length);
  for (let n = 0; n < e.length; n++) t[n] = Math.max(-1, e[n] / 32768);
  return t;
}
class Vp {
  constructor({ onStarted: t, onEnded: n } = {}) {
    this.ctx = null, this.nextStartTime = 0, this.activeSources = /* @__PURE__ */ new Set(), this.playing = !1, this.onStarted = t, this.onEnded = n, this._endTimer = null, this.analyser = null, this._freq = null;
  }
  _ensureCtx() {
    if (!this.ctx) {
      const t = window.AudioContext || window.webkitAudioContext;
      this.ctx = new t({ sampleRate: Bi });
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
    const n = this._ensureCtx(), r = Bp($p(t));
    if (r.length === 0) return;
    const i = n.createBuffer(1, r.length, Bi);
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
}, An = {
  listening: G.LISTENING,
  processing: G.PROCESSING,
  speaking: G.SPEAKING
}, Hp = 15e3;
class Up {
  constructor({ sessionId: t, userId: n, lang: r, voice: i, onState: s, onTranscript: o, onChoices: a, onError: u } = {}) {
    this.sessionId = t, this.userId = n || ve().userId, this.lang = r || null, this.voice = i || null, this.onState = s || (() => {
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
    }, Hp);
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
    const t = await ze({ "Content-Type": "application/json" }), n = await Ge()(Zn("/flowdesk/voice/token"), {
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
    const r = new URL(ve().apiBaseUrl, window.location.origin), i = r.protocol === "https:" ? "wss:" : "ws:", s = r.pathname.replace(/\/+$/, ""), o = t.proxySuffix || "/flowdesk/voice/proxy", a = new URLSearchParams();
    a.set("sessionId", this.sessionId), a.set("ticket", t.ticket), this.lang && a.set("lang", this.lang), this.voice && a.set("voice", this.voice);
    const u = (f, ...h) => {
      for (const d of h)
        if (f && f[d]) return f[d];
      return null;
    }, l = u(n, "API-Key", "Api-Key", "api-key", "apikey");
    l && a.set("api_key", l);
    const c = u(n, "Authorization", "authorization");
    return c && /^Bearer\s+/i.test(c) && a.set("access_token", c.replace(/^Bearer\s+/i, "")), `${i}//${r.host}${s}${o}?${a.toString()}`;
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
        An[t.status] && (this._setState(An[t.status]), An[t.status] === G.LISTENING ? this._maybeArmIdleAfterSpeech() : this._clearIdle());
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
    this.playback || (this.playback = new Vp({ onEnded: () => this._maybeArmIdleAfterSpeech() }));
  }
  async _startCapture() {
    this.capture = new jp({
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
function qp({ userId: e, lang: t, voice: n } = {}) {
  const [r, i] = re(G.IDLE), [s, o] = re(null), [a, u] = re(0), l = oe(null), c = oe(null), f = Pe(), h = is((k) => k.session.id);
  ne(() => {
    if (!(r !== G.IDLE && r !== G.ERROR)) {
      u(0);
      return;
    }
    let C = !0;
    const S = () => {
      C && (u(l.current ? l.current.getLevel() : 0), c.current = requestAnimationFrame(S));
    };
    return c.current = requestAnimationFrame(S), () => {
      C = !1, c.current && cancelAnimationFrame(c.current);
    };
  }, [r]);
  const d = Ee(async () => {
    const k = l.current;
    l.current = null, k && await k.stop(), i(G.IDLE);
  }, []), p = Ee(async () => {
    if (l.current) return;
    o(null);
    const k = new Up({
      sessionId: h,
      userId: e || ve().userId,
      lang: t,
      voice: n,
      onState: i,
      onTranscript: (C, S, E) => {
        const L = { source: "voice" };
        C === "assistant" && E && E.meta && Object.assign(L, E.meta), f.addMessage(C, S, L);
      },
      onError: (C) => {
        o(C), i(G.ERROR), console.error("[flowdesk-chat-v2] voice session failed:", C);
        const S = "I couldn't connect to the voice assistant. Please try again in a moment.", E = ve().debug ? C.message : null;
        f.addMessage("system", S, { kind: "voice-error", debugDetail: E }), l.current = null;
      }
    });
    l.current = k, await k.start();
  }, [h, e, t, n, f]), m = Ee(() => l.current ? d() : p(), [p, d]);
  ne(() => () => {
    l.current && l.current.stop();
  }, []);
  const v = r !== G.IDLE && r !== G.ERROR;
  return { state: r, error: s, level: a, isActive: v, start: p, stop: d, toggle: m };
}
function Kp({ state: e = "idle", amplitude: t = 0, size: n = 72, label: r, className: i = "" }) {
  const s = Math.max(0, Math.min(1, Number(t) || 0)), a = e === "speaking" || e === "listening" ? 1 + s * 0.35 : 1;
  return /* @__PURE__ */ g(
    "div",
    {
      className: `fdv2-voice-orb fdv2-voice-orb--${e}${i ? ` ${i}` : ""}`,
      style: { "--orb-size": `${n}px`, "--orb-scale": a },
      role: "status",
      "aria-label": r || e,
      children: /* @__PURE__ */ g("span", { className: "fdv2-voice-orb-core" })
    }
  );
}
const Vi = {
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
}, Wp = (e) => String(e || "en").split("-")[0];
function xr(e) {
  return Vi[Wp(e)] || Vi.en;
}
function Gp(e) {
  const t = xr(e), n = t.find((r) => r.default) || t[0];
  return n ? n.id : null;
}
function Jp(e, t) {
  return !!e && xr(t).some((n) => n.id === e);
}
function mo(e, t) {
  const n = t || e && e.language || "en", r = e && e.voice;
  return Jp(r, n) ? r : Gp(n);
}
const Yp = {
  [G.CONNECTING]: "thinking",
  [G.LISTENING]: "listening",
  [G.PROCESSING]: "thinking",
  [G.SPEAKING]: "speaking"
};
function Qp({ userId: e, onActiveChange: t }) {
  const { t: n } = ee(), [r] = er(), { state: i, level: s, isActive: o, toggle: a } = qp({ userId: e, lang: r.language, voice: mo(r, r.language) });
  ne(() => {
    t?.(o);
  }, [o, t]);
  const u = n("liveChat"), l = i === G.CONNECTING, c = {
    [G.IDLE]: u,
    [G.CONNECTING]: n("liveChatConnecting", "Connecting…"),
    [G.LISTENING]: n("liveChatListening", "Listening…"),
    [G.PROCESSING]: n("liveChatProcessing", "Thinking…"),
    [G.SPEAKING]: n("liveChatSpeaking", "Speaking…"),
    [G.ERROR]: u
  }[i] || u, f = i === G.SPEAKING, h = /* @__PURE__ */ g(
    "button",
    {
      type: "button",
      className: `fdv2-livechat-fab${o ? " is-active" : ""}`,
      "data-voice-state": i,
      style: f ? { "--fdv2-level": s || 0 } : void 0,
      onClick: a,
      "aria-pressed": o,
      title: c,
      "aria-label": c,
      children: l ? (
        // spinner
        /* @__PURE__ */ g("svg", { className: "fdv2-spin", width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", "aria-hidden": "true", children: /* @__PURE__ */ g("path", { d: "M21 12a9 9 0 1 1-6.219-8.56" }) })
      ) : o ? (
        // active → tap to stop voice and go back to typing (crossed-out mic)
        /* @__PURE__ */ N("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
          /* @__PURE__ */ g("path", { d: "M12 19v3" }),
          /* @__PURE__ */ g("path", { d: "M15 9.34V5a3 3 0 0 0-5.68-1.33" }),
          /* @__PURE__ */ g("path", { d: "M16.95 16.95A7 7 0 0 1 5 12v-2" }),
          /* @__PURE__ */ g("path", { d: "M18.89 13.23A7 7 0 0 0 19 12v-2" }),
          /* @__PURE__ */ g("path", { d: "m2 2 20 20" }),
          /* @__PURE__ */ g("path", { d: "M9 9v3a3 3 0 0 0 5.12 2.12" })
        ] })
      ) : (
        // idle → tap to start voice (mic)
        /* @__PURE__ */ N("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
          /* @__PURE__ */ g("path", { d: "M12 19v3" }),
          /* @__PURE__ */ g("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
          /* @__PURE__ */ g("rect", { x: "9", y: "2", width: "6", height: "13", rx: "3" })
        ] })
      )
    }
  ), d = o ? /* @__PURE__ */ g("div", { className: "fdv2-voice-overlay", role: "presentation", onClick: a, children: /* @__PURE__ */ N("div", { className: "fdv2-voice-stage", onClick: (p) => p.stopPropagation(), children: [
    /* @__PURE__ */ g(Kp, { state: Yp[i] || "idle", amplitude: s, size: 14, label: c }),
    /* @__PURE__ */ g("div", { className: "fdv2-voice-status", children: c }),
    /* @__PURE__ */ g("button", { type: "button", className: "fdv2-voice-end", onClick: a, children: n("liveChatEnd", "End") })
  ] }) }) : null;
  return /* @__PURE__ */ N(Gn, { children: [
    h,
    d
  ] });
}
function Xp() {
  return /* @__PURE__ */ N(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("line", { x1: "4", y1: "21", x2: "4", y2: "14" }),
        /* @__PURE__ */ g("line", { x1: "4", y1: "10", x2: "4", y2: "3" }),
        /* @__PURE__ */ g("line", { x1: "12", y1: "21", x2: "12", y2: "12" }),
        /* @__PURE__ */ g("line", { x1: "12", y1: "8", x2: "12", y2: "3" }),
        /* @__PURE__ */ g("line", { x1: "20", y1: "21", x2: "20", y2: "16" }),
        /* @__PURE__ */ g("line", { x1: "20", y1: "12", x2: "20", y2: "3" }),
        /* @__PURE__ */ g("line", { x1: "1", y1: "14", x2: "7", y2: "14" }),
        /* @__PURE__ */ g("line", { x1: "9", y1: "8", x2: "15", y2: "8" }),
        /* @__PURE__ */ g("line", { x1: "17", y1: "16", x2: "23", y2: "16" })
      ]
    }
  );
}
function Zp() {
  return /* @__PURE__ */ N(
    "svg",
    {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("circle", { cx: "12", cy: "12", r: "10" }),
        /* @__PURE__ */ g("line", { x1: "2", y1: "12", x2: "22", y2: "12" }),
        /* @__PURE__ */ g("path", { d: "M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" })
      ]
    }
  );
}
function eg() {
  return /* @__PURE__ */ N(
    "svg",
    {
      width: "15",
      height: "15",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("polygon", { points: "11 5 6 9 2 9 2 15 6 15 11 19 11 5" }),
        /* @__PURE__ */ g("path", { d: "M15.54 8.46a5 5 0 0 1 0 7.07" }),
        /* @__PURE__ */ g("path", { d: "M19.07 4.93a10 10 0 0 1 0 14.14" })
      ]
    }
  );
}
function Hi() {
  return /* @__PURE__ */ g(
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
      children: /* @__PURE__ */ g("polyline", { points: "6 9 12 15 18 9" })
    }
  );
}
function tg({ open: e, onClose: t }) {
  const { t: n } = ee(), [r, i] = er(), s = xr(r.language), o = mo(r, r.language);
  return ne(() => {
    if (!e) return;
    const a = (u) => {
      u.key === "Escape" && t && t();
    };
    return document.addEventListener("keydown", a), () => document.removeEventListener("keydown", a);
  }, [e, t]), e ? qi(
    /* @__PURE__ */ g("div", { className: "fdv2-settings-overlay", role: "presentation", onClick: t, children: /* @__PURE__ */ N(
      "div",
      {
        className: "fdv2-settings-dialog",
        role: "dialog",
        "aria-modal": "true",
        "aria-labelledby": "fdv2-settings-title",
        onClick: (a) => a.stopPropagation(),
        children: [
          /* @__PURE__ */ N("header", { className: "fdv2-settings-header", children: [
            /* @__PURE__ */ N("span", { className: "fdv2-settings-header-title", children: [
              /* @__PURE__ */ g("span", { className: "fdv2-settings-icon", "aria-hidden": "true", children: /* @__PURE__ */ g(Xp, {}) }),
              /* @__PURE__ */ g("span", { id: "fdv2-settings-title", className: "fdv2-settings-title", children: n("settings.title", "AI Settings") })
            ] }),
            /* @__PURE__ */ g("button", { type: "button", className: "fdv2-settings-close", onClick: t, "aria-label": n("settings.close", "Close"), children: "×" })
          ] }),
          /* @__PURE__ */ N("div", { className: "fdv2-settings-body", children: [
            /* @__PURE__ */ N("div", { className: "fdv2-setting-group", children: [
              /* @__PURE__ */ N("label", { className: "fdv2-setting-label", htmlFor: "fdv2-setting-language", children: [
                /* @__PURE__ */ g(Zp, {}),
                " ",
                n("settings.language", "Language")
              ] }),
              /* @__PURE__ */ N("div", { className: "fdv2-select-wrap", children: [
                /* @__PURE__ */ g(
                  "select",
                  {
                    id: "fdv2-setting-language",
                    className: "fdv2-setting-select",
                    value: r.language,
                    onChange: (a) => i({ language: a.target.value, voice: null }),
                    children: Qn.map((a) => /* @__PURE__ */ g("option", { value: a.code, children: a.label }, a.code))
                  }
                ),
                /* @__PURE__ */ g("span", { className: "fdv2-select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ g(Hi, {}) })
              ] }),
              /* @__PURE__ */ g("p", { className: "fdv2-setting-hint", children: n("settings.languageHint", "Used for AI responses and for voice/text recognition. Auto-detection is off.") })
            ] }),
            /* @__PURE__ */ N("div", { className: "fdv2-setting-group", children: [
              /* @__PURE__ */ N("label", { className: "fdv2-setting-label", htmlFor: "fdv2-setting-voice", children: [
                /* @__PURE__ */ g(eg, {}),
                " ",
                n("settings.voice", "Assistant voice")
              ] }),
              /* @__PURE__ */ N("div", { className: "fdv2-select-wrap", children: [
                /* @__PURE__ */ g(
                  "select",
                  {
                    id: "fdv2-setting-voice",
                    className: "fdv2-setting-select",
                    value: o || "",
                    onChange: (a) => i({ voice: a.target.value }),
                    children: s.map((a) => /* @__PURE__ */ N("option", { value: a.id, children: [
                      a.label,
                      a.default ? ` · ${n("settings.voiceDefault", "Default")}` : ""
                    ] }, a.id))
                  }
                ),
                /* @__PURE__ */ g("span", { className: "fdv2-select-chevron", "aria-hidden": "true", children: /* @__PURE__ */ g(Hi, {}) })
              ] }),
              /* @__PURE__ */ g("p", { className: "fdv2-setting-hint", children: n("settings.voiceHint", "Voice used for the AI assistant’s spoken replies.") })
            ] })
          ] })
        ]
      }
    ) }),
    document.body
  ) : null;
}
const ng = 8;
function rg({ userId: e, showVoiceControls: t = !0, showSettings: n = !0, onVoiceActiveChange: r }) {
  const { t: i } = ee(), { loading: s, composerDisabled: o } = we(), a = Pe(), [u, l] = re(""), [c, f] = re(!1), h = oe(null), d = oe(null), p = Ee(() => {
    const S = h.current;
    if (!S) return;
    S.style.height = "auto";
    const L = (parseFloat(getComputedStyle(S).lineHeight) || 20) * ng;
    S.style.height = `${Math.min(S.scrollHeight, L)}px`, S.style.overflowY = S.scrollHeight > L ? "auto" : "hidden";
  }, []);
  ne(() => {
    p();
  }, [u, p]), ne(() => {
    !s && !o && h.current?.focus();
  }, [s, o]);
  const m = u.trim().length > 0 && !s && !o, v = Ee(async () => {
    const S = u.trim();
    if (!S || s || o) return;
    l("");
    const E = new AbortController();
    d.current = E;
    try {
      await a.sendMessage(S, e, E.signal);
    } finally {
      d.current = null, h.current?.focus();
    }
  }, [u, s, o, a, e]), k = Ee(() => {
    d.current?.abort();
  }, []);
  return /* @__PURE__ */ N("div", { className: "fdv2-composer-wrap", children: [
    /* @__PURE__ */ N("div", { className: `fdv2-composer ${o ? "is-disabled" : ""}`, children: [
      /* @__PURE__ */ g(
        "textarea",
        {
          ref: h,
          className: "fdv2-textarea",
          rows: 1,
          value: u,
          onChange: (S) => l(S.target.value),
          onKeyDown: (S) => {
            S.key === "Enter" && !S.shiftKey && (S.preventDefault(), v());
          },
          placeholder: i(o ? "composerDisabled" : "composerPlaceholder"),
          disabled: o,
          "aria-label": i("composerPlaceholder")
        }
      ),
      s ? /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn fdv2-stop", onClick: k, title: i("stop"), "aria-label": i("stop"), children: /* @__PURE__ */ g("svg", { width: "16", height: "16", viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": "true", children: /* @__PURE__ */ g("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) }) }) : /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn fdv2-send", onClick: v, disabled: !m, title: i("send"), "aria-label": i("send"), children: /* @__PURE__ */ N("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.9", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
        /* @__PURE__ */ g("path", { d: "M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z" }),
        /* @__PURE__ */ g("path", { d: "m21.854 2.147-10.94 10.939" })
      ] }) }),
      (n || t) && /* @__PURE__ */ N("div", { className: "fdv2-composer-tools", children: [
        t && /* @__PURE__ */ g(Qp, { userId: e, onActiveChange: r }),
        n && /* @__PURE__ */ g(
          "button",
          {
            type: "button",
            className: "fdv2-icon-btn fdv2-settings-btn",
            onClick: () => f(!0),
            title: i("settings.open", "AI Settings"),
            "aria-label": i("settings.open", "AI Settings"),
            "aria-haspopup": "dialog",
            children: /* @__PURE__ */ N("svg", { width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", children: [
              /* @__PURE__ */ g("circle", { cx: "12", cy: "12", r: "3" }),
              /* @__PURE__ */ g("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })
            ] })
          }
        )
      ] })
    ] }),
    /* @__PURE__ */ g("div", { className: "fdv2-composer-hint", children: i("composerHint") }),
    /* @__PURE__ */ g(tg, { open: c, onClose: () => f(!1) })
  ] });
}
function ig() {
  const { t: e } = ee(), { loading: t, currentNode: n } = we();
  if (!t) return null;
  const r = n && e(`node.${n}`, { defaultValue: "" }) || e("thinking");
  return /* @__PURE__ */ N("div", { className: "fdv2-message fdv2-message-assistant fdv2-typing", "aria-live": "polite", children: [
    /* @__PURE__ */ g("div", { className: "fdv2-avatar", "aria-hidden": "true", children: "◆" }),
    /* @__PURE__ */ g("div", { className: "fdv2-bubble-col", children: /* @__PURE__ */ N("div", { className: "fdv2-typing-row", children: [
      /* @__PURE__ */ N("span", { className: "fdv2-typing-dots", "aria-hidden": "true", children: [
        /* @__PURE__ */ g("i", {}),
        /* @__PURE__ */ g("i", {}),
        /* @__PURE__ */ g("i", {})
      ] }),
      /* @__PURE__ */ g("span", { className: "fdv2-typing-text", children: r })
    ] }) })
  ] });
}
const sg = {
  extracted: "🤖",
  user_edited: "✏️",
  context: "📍",
  resolved: "⚙️"
};
function yo(e, t, n, r = /* @__PURE__ */ new Set()) {
  return r.has(e) ? !1 : (r.add(e), t?.[e]?.stale ? !0 : ((n?.slots || []).find((a) => a.slotId === e)?.dependsOn || []).some((a) => yo(a, t, n, r)));
}
function og(e) {
  return (e?.phases || []).map((r) => ({
    phase: r,
    slots: (e?.slots || []).filter((i) => i.phase === r)
  })).filter((r) => r.slots.length > 0);
}
function ag(e) {
  return e == null || e === "" ? null : typeof e == "object" ? e.name || e.city || e.id || e.mode || JSON.stringify(e) : String(e);
}
function lg({ slotDef: e, slotValue: t, affectedStale: n, onEdit: r }) {
  const { t: i } = ee(), [s, o] = re(!1), [a, u] = re(""), l = oe(null), c = ag(t?.value), f = t?.provenance || null, h = f ? sg[f] : null, d = f ? i(`provenance.${f}`, { defaultValue: f }) : "", p = e.type === "enum", v = !(t && typeof t.value == "object");
  ne(() => {
    s && l.current?.focus();
  }, [s]);
  const k = () => {
    v && (u(p ? t?.value ?? "" : c ?? ""), o(!0));
  }, C = () => {
    o(!1);
    const E = a;
    E !== "" && E !== (t?.value ?? "") && r(e.slotId, E);
  }, S = (E) => {
    E.key === "Enter" && (E.preventDefault(), C()), E.key === "Escape" && o(!1);
  };
  return /* @__PURE__ */ N("div", { className: `fdv2-slot ${n ? "is-stale" : ""}`, children: [
    /* @__PURE__ */ N("div", { className: "fdv2-slot-label", children: [
      (e.promptHint, e.slotId),
      e.required && /* @__PURE__ */ g("span", { className: "fdv2-slot-req", title: i("slot.required"), children: "*" })
    ] }),
    /* @__PURE__ */ N("div", { className: "fdv2-slot-value", children: [
      s ? p ? /* @__PURE__ */ N("select", { ref: l, value: a, onChange: (E) => u(E.target.value), onBlur: C, onKeyDown: S, className: "fdv2-slot-input", children: [
        /* @__PURE__ */ g("option", { value: "", disabled: !0, children: "—" }),
        (e.presentOptions || []).map((E) => /* @__PURE__ */ g("option", { value: E.value, children: E.label }, E.value))
      ] }) : /* @__PURE__ */ g("input", { ref: l, value: a, onChange: (E) => u(E.target.value), onBlur: C, onKeyDown: S, className: "fdv2-slot-input" }) : /* @__PURE__ */ g("button", { type: "button", className: `fdv2-slot-val-btn ${c ? "" : "is-empty"} ${v ? "" : "is-readonly"}`, onClick: k, title: v ? i("slot.edit") : "", children: c || "—" }),
      h && /* @__PURE__ */ g("span", { className: "fdv2-slot-prov", title: d, "aria-label": d, children: h }),
      n && /* @__PURE__ */ g("span", { className: "fdv2-slot-stale", title: i("slot.stale"), children: "⚠️" })
    ] })
  ] });
}
function ug() {
  const { t: e } = ee(), t = Ma(), n = za(), r = as(), { draftPanelOpen: i } = we(), s = Pe(), o = !!r.serviceId;
  if (!i)
    return /* @__PURE__ */ g("div", { className: "fdv2-draft-collapsed", children: /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn", onClick: s.toggleDraftPanel, title: e("draft.expand"), "aria-label": e("draft.expand"), children: "▸" }) });
  const a = n?.metadata?.title || r.serviceId || e("draft.title"), u = e(`status.${r.status || "draft"}`, { defaultValue: r.status || "" }), l = n ? og(n) : [], c = t.beneficiary;
  return /* @__PURE__ */ N("div", { className: "fdv2-draft-panel", children: [
    /* @__PURE__ */ N("div", { className: "fdv2-draft-head", children: [
      /* @__PURE__ */ g("div", { className: "fdv2-draft-title", children: a }),
      /* @__PURE__ */ N("div", { className: "fdv2-draft-headright", children: [
        /* @__PURE__ */ g("span", { className: `fdv2-status-badge fdv2-status-${r.status || "draft"}`, children: u }),
        /* @__PURE__ */ g("button", { type: "button", className: "fdv2-icon-btn fdv2-draft-collapse", onClick: s.toggleDraftPanel, title: e("draft.collapse"), "aria-label": e("draft.collapse"), children: "▾" })
      ] })
    ] }),
    o ? /* @__PURE__ */ N("div", { className: "fdv2-draft-body", children: [
      c && /* @__PURE__ */ N("div", { className: "fdv2-draft-benef", children: [
        /* @__PURE__ */ g("span", { className: "fdv2-benef-label", children: e("draft.beneficiary") }),
        /* @__PURE__ */ g("span", { className: "fdv2-benef-val", children: c.mode === "self" ? e("draft.forSelf") : c.resolvedProfile?.name || c.userId || "—" })
      ] }),
      l.length === 0 && /* @__PURE__ */ g("div", { className: "fdv2-draft-empty", children: /* @__PURE__ */ g("p", { children: e("draft.loading") }) }),
      l.map((f) => /* @__PURE__ */ N("section", { className: "fdv2-draft-group", children: [
        /* @__PURE__ */ g("h4", { className: "fdv2-draft-group-title", children: e(`phase.${f.phase}`, { defaultValue: f.phase }) }),
        f.slots.map((h) => /* @__PURE__ */ g(
          lg,
          {
            slotDef: h,
            slotValue: t.slots[h.slotId],
            affectedStale: yo(h.slotId, t.slots, n),
            onEdit: s.patchSlot
          },
          h.slotId
        ))
      ] }, f.phase))
    ] }) : /* @__PURE__ */ N("div", { className: "fdv2-draft-empty", children: [
      /* @__PURE__ */ g("p", { children: e("draft.empty") }),
      /* @__PURE__ */ g("p", { className: "fdv2-draft-empty-hint", children: e("draft.emptyHint") })
    ] })
  ] });
}
function cg({
  showDraftPanel: e,
  showLanguageSwitcher: t,
  showVoiceControls: n,
  className: r,
  serviceId: i,
  sessionId: s = null,
  emptyState: o,
  userProfile: a,
  userAvatar: u,
  assistantAvatar: l,
  anchorContext: c = null,
  compact: f = !1,
  onNavigate: h,
  onVoiceActiveChange: d
}) {
  const { t: p } = ee(), m = Pe(), v = as(), k = Je(), [C, S] = re(Vr()), E = oe(!1);
  ne(() => {
    E.current || !s || (E.current = !0, m.adoptSession(s), m.loadVoiceHistory && m.loadVoiceHistory());
  }, [s, m]), ne(() => {
    const R = () => S(Vr());
    return be.on("languageChanged", R), () => be.off("languageChanged", R);
  }, []);
  const L = oe(!1);
  ne(() => {
    m.setAnchorContext && m.setAnchorContext(c || null), c && c.anchorId && !L.current && (L.current = !0, m.sendAnchorExplain(c));
  }, [c, m]), ne(() => {
    a && a.userId && m.setUser(a);
  }, [a, m]);
  const x = oe(!1);
  return ne(() => {
    x.current || !i || (x.current = !0, v.serviceId !== i && (k.getState().messages.length > 0 || m.startSession(i)));
  }, [i, v.serviceId, m]), /* @__PURE__ */ g(
    "div",
    {
      className: `fdv2-root${f ? " fdv2-compact" : ""}${r ? ` ${r}` : ""}`,
      "data-feature": "altiora-chat",
      dir: C,
      children: /* @__PURE__ */ N("main", { className: "fdv2-main", children: [
        /* @__PURE__ */ N("section", { className: "fdv2-conversation", "aria-label": "Conversation", children: [
          /* @__PURE__ */ g(_p, { emptyState: o, onNavigate: h, userAvatar: u, assistantAvatar: l, children: /* @__PURE__ */ g(ig, {}) }),
          /* @__PURE__ */ g(rg, { showVoiceControls: n, showSettings: t, onVoiceActiveChange: d })
        ] }),
        e && /* @__PURE__ */ g("aside", { className: "fdv2-draft", "aria-label": p("draft.requestLabel"), children: /* @__PURE__ */ g(ug, {}) })
      ] })
    }
  );
}
function fg({
  apiBaseUrl: e,
  userId: t,
  userProfile: n,
  userAvatar: r,
  assistantAvatar: i,
  getAuthHeaders: s,
  fetchImpl: o,
  eventSourceImpl: a,
  lang: u,
  serviceId: l = null,
  showDraftPanel: c = !1,
  showLanguageSwitcher: f = !0,
  showVoiceControls: h = !0,
  className: d,
  emptyState: p,
  children: m,
  onSubmitted: v,
  onError: k,
  onSessionStart: C,
  anchorContext: S = null,
  compact: E = !1,
  // eslint-disable-next-line no-unused-vars -- Phase 3: host close handler, consumed by the floating window wrapper
  onClose: L,
  onNavigate: x,
  onOpenForm: R,
  // REQ-005: the host opens its own detail dialog when a row in the chat is clicked.
  // Absent, the rows still read — they simply do not offer to open.
  onReveal: j,
  storeId: F = "default",
  sessionId: w = null,
  debug: A = !1,
  onVoiceActiveChange: D
}) {
  const M = oe(null), _ = oe(null), O = os(), V = Pe();
  ne(() => {
    if (!R || !Array.isArray(O) || (_.current === null && (_.current = new Set(O.map((se) => se.id))), !O.length)) return;
    const te = [...O].reverse().find((se) => se.metadata && se.metadata.openForm);
    if (!(!te || M.current === te.id)) {
      if (M.current = te.id, _.current.has(te.id)) {
        V.resetSession();
        return;
      }
      R(te.metadata.openForm), V.resetSession();
    }
  }, [O, R, V]), Ia({
    apiBaseUrl: e,
    userId: t,
    getAuthHeaders: s,
    fetchImpl: o,
    eventSourceImpl: a,
    onSubmitted: v,
    onError: k,
    onSessionStart: C,
    onReveal: j,
    debug: A
  });
  const [W] = er();
  return ne(() => {
    u && !ja() && ls({ language: u });
  }, [u]), ne(() => {
    ya(W.language);
  }, [W.language]), /* @__PURE__ */ g(Zi, { i18n: be, children: /* @__PURE__ */ g(Fa, { storeId: F, children: /* @__PURE__ */ g(
    cg,
    {
      showDraftPanel: c,
      showLanguageSwitcher: f,
      showVoiceControls: h,
      className: d,
      serviceId: l,
      sessionId: w,
      emptyState: p ?? m,
      userProfile: n,
      userAvatar: r,
      assistantAvatar: i,
      anchorContext: S,
      compact: E,
      onNavigate: x,
      onVoiceActiveChange: D
    }
  ) }) });
}
const bo = Jn({
  isOpen: !1,
  anchorContext: null,
  openChat: () => {
  },
  closeChat: () => {
  }
});
function xg({ children: e, storeId: t = "default" }) {
  const [n, r] = re(!1), [i, s] = re(null), o = Ee((u = null) => {
    s(u || null), r(!0);
  }, []), a = Ee(() => {
    r(!1);
  }, []);
  return ne(() => {
    const u = (c) => o(c && c.detail ? c.detail : null), l = () => a();
    return window.addEventListener("openAltioraChat", u), window.addEventListener("closeAltioraChat", l), () => {
      window.removeEventListener("openAltioraChat", u), window.removeEventListener("closeAltioraChat", l);
    };
  }, [o, a]), /* @__PURE__ */ g(bo.Provider, { value: { isOpen: n, anchorContext: i, openChat: o, closeChat: a, storeId: t }, children: e });
}
const dg = () => Yn(bo);
function hg() {
  return /* @__PURE__ */ N(
    "svg",
    {
      width: "16",
      height: "16",
      viewBox: "0 0 24 24",
      fill: "none",
      "aria-hidden": "true",
      stroke: "currentColor",
      strokeWidth: "2",
      strokeLinecap: "round",
      strokeLinejoin: "round",
      children: [
        /* @__PURE__ */ g("path", { d: "M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z" }),
        /* @__PURE__ */ g("path", { d: "M20 3v4" }),
        /* @__PURE__ */ g("path", { d: "M22 5h-4" }),
        /* @__PURE__ */ g("path", { d: "M4 17v2" }),
        /* @__PURE__ */ g("path", { d: "M5 18H3" })
      ]
    }
  );
}
function pg({ anchorContext: e, closeChat: t, chatProps: n, storeId: r }) {
  const { t: i } = ee();
  ne(() => {
    const u = (l) => {
      l.key === "Escape" && t();
    };
    return document.addEventListener("keydown", u), () => document.removeEventListener("keydown", u);
  }, [t]);
  const s = e && e.anchorTitle;
  return /* @__PURE__ */ g("div", { className: "fdv2-floating-overlay", children: /* @__PURE__ */ N("div", { className: "fdv2-floating-window", role: "dialog", "aria-modal": "true", "aria-label": s || "Ask altiora AI", children: [
    /* @__PURE__ */ N("header", { className: "fdv2-floating-header", children: [
      /* @__PURE__ */ N("span", { className: "fdv2-floating-title-group", children: [
        /* @__PURE__ */ g("span", { className: "fdv2-floating-icon", "aria-hidden": "true", children: /* @__PURE__ */ g(hg, {}) }),
        /* @__PURE__ */ g("span", { className: "fdv2-floating-title", children: s || /* @__PURE__ */ N(Gn, { children: [
          "Ask ",
          /* @__PURE__ */ g("span", { className: "fdv2-floating-title-brand", children: "altiora" }),
          " AI"
        ] }) })
      ] }),
      /* @__PURE__ */ g(
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
    /* @__PURE__ */ g("div", { className: "fdv2-floating-body", children: /* @__PURE__ */ g(fg, { ...n, storeId: r, anchorContext: e, compact: !0, onClose: t }) })
  ] }) });
}
function kg({ chatProps: e }) {
  const { isOpen: t, anchorContext: n, closeChat: r, storeId: i } = dg();
  return t ? qi(
    /* @__PURE__ */ g(Zi, { i18n: be, children: /* @__PURE__ */ g(pg, { anchorContext: n, closeChat: r, chatProps: e || {}, storeId: i }) }),
    document.body
  ) : null;
}
function xo(e, t) {
  window.dispatchEvent(new CustomEvent("altioraVoiceExplain", { detail: { anchorId: e, anchorTitle: t } }));
}
function vg({ anchorId: e, anchorTitle: t, className: n = "" }) {
  const { t: r } = ee();
  if (!e) return null;
  const i = t || e;
  return /* @__PURE__ */ g(
    "button",
    {
      type: "button",
      className: `fdv2-explain-trigger${n ? ` ${n}` : ""}`,
      onClick: (s) => {
        s.stopPropagation(), xo(e, i);
      },
      "aria-label": r("explain.trigger", { title: i }),
      title: r("explain.triggerTooltip"),
      children: "?"
    }
  );
}
function wg(e) {
  const { t } = ee();
  ne(() => {
    const n = e && e.current || document.body, r = (o) => {
      const a = o.getAttribute("data-kb-anchor");
      if (!a || o.querySelector(":scope > .fdv2-explain-trigger")) return;
      const u = o.getAttribute("data-kb-title") || a;
      window.getComputedStyle(o).position === "static" && (o.style.position = "relative");
      const l = document.createElement("button");
      l.type = "button", l.className = "fdv2-explain-trigger", l.textContent = "?", l.setAttribute("aria-label", t("explain.trigger", { title: u })), l.title = t("explain.triggerTooltip"), l.addEventListener("click", (c) => {
        c.stopPropagation(), xo(a, u);
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
  tg as AISettingsDialog,
  Fn as AI_PREFS_EVENT,
  Yt as AI_PREFS_KEY,
  fg as AltioraChat,
  Q as ChatError,
  Fa as ChatStoreProvider,
  fn as DEFAULT_AI_PREFS,
  vg as ExplainTrigger,
  xg as FloatingChatProvider,
  kg as FloatingChatWindow,
  Qn as LANGUAGES,
  bg as SSE_EVENTS,
  Vi as VOICE_OPTIONS,
  Ce as chatClient,
  Ia as configureChat,
  Vr as currentDir,
  nt as currentLang,
  fg as default,
  ma as dirFor,
  mo as effectiveVoice,
  $t as getAIPrefs,
  rs as getChatStore,
  ve as getConfig,
  Gp as getDefaultVoice,
  xr as getVoicesForLanguage,
  ja as hasStoredAIPrefs,
  be as i18n,
  Jp as isValidVoice,
  ls as setAIPrefs,
  ya as setLang,
  er as useAIPrefs,
  Je as useActiveStore,
  Pe as useChatActions,
  is as useChatStore,
  Ma as useDraft,
  dg as useFloatingChat,
  wg as useKBAnchors,
  os as useMessages,
  za as useSchema,
  as as useSession,
  we as useUI
};
//# sourceMappingURL=flowdesk-chat-v2.js.map
