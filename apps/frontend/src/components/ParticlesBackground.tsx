import { useEffect, useState, useCallback } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";

const particlesOptions = {
  background: { color: { value: "transparent" } },
  fpsLimit: 60,
  particles: {
    number: { value: 80, density: { enable: true } },
    color: { value: ["#00d9ff", "#7c3aed", "#00ff9f"] },
    opacity: {
      value: { min: 0.05, max: 0.3 },
      animation: { enable: true, speed: 0.5, minimumValue: 0.05 },
    },
    size: {
      value: { min: 0.5, max: 2 },
      animation: { enable: true, speed: 1, minimumValue: 0.5 },
    },
    move: {
      enable: true,
      speed: 0.3,
      direction: "none" as const,
      random: true,
      straight: false,
      outModes: "out" as const,
    },
    links: {
      enable: true,
      distance: 150,
      color: "#7c3aed",
      opacity: 0.08,
      width: 1,
    },
  },
  detectRetina: true,
};

export function ParticlesBackground() {
  const [ready, setReady] = useState(false);

  const particlesInit = useCallback(async () => {
    await initParticlesEngine(async (engine) => {
      await loadSlim(engine);
    });
    setReady(true);
  }, []);

  useEffect(() => {
    particlesInit();
  }, [particlesInit]);

  if (!ready) return null;

  return (
    <Particles
      id="tsparticles"
      options={particlesOptions}
      className="fixed inset-0 -z-10 pointer-events-none"
    />
  );
}
