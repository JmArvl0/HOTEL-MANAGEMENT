"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { SCENES } from "@/lib/room-images";

const scenes = [
  { name: "Slow mornings", title: "Make room for a slower morning.", image: SCENES.morning },
  { name: "Poolside afternoons", title: "A little sunshine. No hurry.", image: SCENES.afternoon },
  { name: "Restful evenings", title: "End the day somewhere beautiful.", image: SCENES.evening },
];

export function ExperienceGallery() {
  const [selected, setSelected] = useState(0);
  return <article className="coast-experience">
    {scenes.map((scene, index) => <Image key={scene.name} src={scene.image} alt={index === selected ? scene.name : ""} fill sizes="(max-width: 800px) 100vw, 50vw" style={{ opacity: index === selected ? 1 : 0 }} aria-hidden={index !== selected} />)}
    <div className="coast-experience-copy">
      <span className="coast-eyebrow">The art of doing a little less</span>
      <h2 aria-live="polite">{scenes[selected].title}</h2>
      <a className="coast-button coast-button-light" href="#amenities">Explore your stay <ArrowRight size={16}/></a>
    </div>
    <div className="coast-scene-choices" role="group" aria-label="Explore the hotel">
      {scenes.map((scene, index) => <button key={scene.name} type="button" aria-pressed={selected === index} onClick={() => setSelected(index)}>
        <Image src={scene.image} alt="" width={160} height={90}/><span>{scene.name}</span>
      </button>)}
    </div>
  </article>;
}
