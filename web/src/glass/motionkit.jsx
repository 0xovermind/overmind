import React, { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring, useScroll, useVelocity, useTransform, useReducedMotion } from "framer-motion";

const EASE = [0.22, 1, 0.36, 1];
const finePointer = () => typeof window !== "undefined" && window.matchMedia?.("(pointer: fine)").matches;

/** Letters fly up one by one. */
export function Chars({ text, delay = 0, className = "", step = 0.035 }) {
  return (
    <span className={`chars ${className}`} aria-label={text}>
      {[...text].map((ch, i) => (
        <motion.span key={i} aria-hidden="true" className="ch"
          initial={{ y: "0.9em", opacity: 0, rotate: 8 }} animate={{ y: 0, opacity: 1, rotate: 0 }}
          transition={{ delay: delay + i * step, duration: 0.8, ease: EASE }}>
          {ch === " " ? " " : ch}
        </motion.span>
      ))}
    </span>
  );
}

/** Words rise out of a mask when scrolled into view. */
export function Words({ children, className = "", as = "h2" }) {
  const Tag = motion[as];
  const parts = [];
  React.Children.forEach(children, (c) => {
    if (typeof c === "string") c.split(/(\s+)/).forEach((w) => w.trim() && parts.push({ w, i: false }));
    else if (c?.props?.children) String(c.props.children).split(/(\s+)/).forEach((w) => w.trim() && parts.push({ w, i: true }));
  });
  return (
    <Tag className={className} initial="hide" whileInView="show" viewport={{ once: true, margin: "-60px" }}
      variants={{ show: { transition: { staggerChildren: 0.06 } } }}>
      {parts.map((p, i) => (
        <span key={i} className="wmask">
          <motion.span className="w" variants={{ hide: { y: "105%" }, show: { y: 0, transition: { duration: 0.8, ease: EASE } } }}>
            {p.i ? <i>{p.w}</i> : p.w}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}

/** Card that tilts toward the cursor in 3D. */
export function Tilt({ children, className = "", max = 7, ...rest }) {
  const rx = useSpring(0, { stiffness: 200, damping: 18 });
  const ry = useSpring(0, { stiffness: 200, damping: 18 });
  const glowX = useMotionValue(50), glowY = useMotionValue(50);
  const bg = useTransform([glowX, glowY], ([x, y]) => `radial-gradient(240px circle at ${x}% ${y}%, rgba(225,225,225,0.35), transparent 70%)`);
  const onMove = (e) => {
    if (!finePointer()) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
    ry.set((px - 0.5) * max * 2);
    rx.set(-(py - 0.5) * max * 2);
    glowX.set(px * 100); glowY.set(py * 100);
  };
  const reset = () => { rx.set(0); ry.set(0); };
  return (
    <motion.div className={`tilt ${className}`} style={{ rotateX: rx, rotateY: ry, transformPerspective: 900 }} onMouseMove={onMove} onMouseLeave={reset} {...rest}>
      <motion.span className="tilt-glow" style={{ background: bg }} aria-hidden="true" />
      {children}
    </motion.div>
  );
}

/** Element that leans toward the cursor when it's close. */
export function Magnetic({ children, strength = 0.35 }) {
  const x = useSpring(0, { stiffness: 260, damping: 16 });
  const y = useSpring(0, { stiffness: 260, damping: 16 });
  const onMove = (e) => {
    if (!finePointer()) return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  return (
    <motion.span className="magnetic" style={{ x, y }} onMouseMove={onMove} onMouseLeave={() => { x.set(0); y.set(0); }}>
      {children}
    </motion.span>
  );
}

/** Neon dot + trailing ring cursor (mouse only). */
export function Cursor() {
  const reduce = useReducedMotion();
  const [on, setOn] = useState(false);
  const [hot, setHot] = useState(false);
  const x = useMotionValue(-100), y = useMotionValue(-100);
  const rx = useSpring(x, { stiffness: 300, damping: 28, mass: 0.6 });
  const ry = useSpring(y, { stiffness: 300, damping: 28, mass: 0.6 });
  useEffect(() => {
    if (!finePointer() || reduce) return;
    setOn(true);
    document.documentElement.classList.add("has-cursor");
    const move = (e) => {
      x.set(e.clientX); y.set(e.clientY);
      setHot(!!e.target.closest?.("a, button, input, .tilt"));
    };
    window.addEventListener("pointermove", move);
    return () => { window.removeEventListener("pointermove", move); document.documentElement.classList.remove("has-cursor"); };
  }, [reduce, x, y]);
  if (!on) return null;
  return (
    <>
      <motion.div className="cur-dot" style={{ x, y }} />
      <motion.div className={`cur-ring ${hot ? "hot" : ""}`} style={{ x: rx, y: ry }} />
    </>
  );
}

/** Thin green bar showing how far down the page you are. */
export function ScrollProgress() {
  const { scrollYProgress } = useScroll();
  const sx = useSpring(scrollYProgress, { stiffness: 120, damping: 24 });
  return <motion.div className="scroll-bar" style={{ scaleX: sx }} />;
}

/** Skew that follows scroll speed (for the marquee). */
export function useScrollSkew(max = 10) {
  const { scrollY } = useScroll();
  const vel = useVelocity(scrollY);
  const smooth = useSpring(vel, { stiffness: 80, damping: 30 });
  return useTransform(smooth, [-2500, 0, 2500], [max, 0, -max], { clamp: true });
}

/** Text that resolves from random glyphs when it scrolls into view. */
export function Scramble({ text, className = "", as = "p", speed = 28 }) {
  const [out, setOut] = useState(text);
  const [seen, setSeen] = useState(false);
  const ref = useRef(null);
  const reduce = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el || reduce) return;
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "-40px" });
    io.observe(el);
    return () => io.disconnect();
  }, [reduce]);
  useEffect(() => {
    if (!seen) return;
    const glyphs = "!<>-_\\/[]{}=+*^?#$%&01";
    let frame = 0;
    const total = text.length * 2 + 8;
    const t = setInterval(() => {
      frame++;
      setOut([...text].map((c, i) => (c === " " ? " " : frame > i * 2 + 6 ? c : glyphs[(Math.random() * glyphs.length) | 0])).join(""));
      if (frame >= total) clearInterval(t);
    }, speed);
    return () => clearInterval(t);
  }, [seen, text, speed]);
  const Tag = as;
  return <Tag ref={ref} className={className} aria-label={text}><span aria-hidden="true">{out}</span></Tag>;
}

/** Types text out letter by letter, restarting whenever `text` changes. */
export function Typewriter({ text, speed = 22 }) {
  const [n, setN] = useState(0);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) { setN(text.length); return; }
    setN(0);
    const t = setInterval(() => setN((x) => { if (x >= text.length) { clearInterval(t); return x; } return x + 1; }), speed);
    return () => clearInterval(t);
  }, [text, speed, reduce]);
  return <>{text.slice(0, n)}<span className="caret" aria-hidden="true" /></>;
}

/** Returns true for a short burst every few seconds (drives the glitch class). */
export function useGlitch(min = 3500, max = 7000) {
  const [on, setOn] = useState(false);
  const reduce = useReducedMotion();
  useEffect(() => {
    if (reduce) return;
    let t1, t2;
    const loop = () => {
      t1 = setTimeout(() => { setOn(true); t2 = setTimeout(() => { setOn(false); loop(); }, 450); }, min + Math.random() * (max - min));
    };
    loop();
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [min, max, reduce]);
  return on;
}

/** Which of the given section ids is currently in the middle of the screen. */
export function useScrollSpy(ids) {
  const [active, setActive] = useState(null);
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean);
    if (!els.length) return; // sections mount after data loads; the effect re-runs on the next render
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); });
    }, { rootMargin: "-45% 0px -50% 0px" });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  });
  return active;
}

/** Soft light that follows the cursor across the dark page. */
export function Spotlight() {
  const x = useSpring(-500, { stiffness: 90, damping: 22 });
  const y = useSpring(-500, { stiffness: 90, damping: 22 });
  const bg = useTransform([x, y], ([a, b]) => `radial-gradient(520px circle at ${a}px ${b}px, rgba(255,255,255,0.07), transparent 70%)`);
  useEffect(() => {
    if (!finePointer()) return;
    const move = (e) => { x.set(e.clientX); y.set(e.clientY); };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [x, y]);
  return <motion.div className="spotlight" style={{ background: bg }} aria-hidden="true" />;
}

/** Pointer position normalised to -1..1, smoothed. */
export function usePointer() {
  const px = useSpring(0, { stiffness: 60, damping: 20 });
  const py = useSpring(0, { stiffness: 60, damping: 20 });
  const ref = useRef(null);
  useEffect(() => {
    const move = (e) => { px.set((e.clientX / window.innerWidth) * 2 - 1); py.set((e.clientY / window.innerHeight) * 2 - 1); };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, [px, py]);
  return { px, py, ref };
}
