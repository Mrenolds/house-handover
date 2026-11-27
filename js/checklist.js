// Handover checklist data. Changing item wording is fine; changing ids or
// CHECKLIST_VERSION after builders start will break existing drafts.
export const CHECKLIST_VERSION = "2026-11-25";

export const GROUPS = [
  { id: "ground", name: "Ground floor" },
  { id: "first", name: "First floor" },
  { id: "second", name: "Second floor" },
  { id: "external", name: "External & terraces" },
  { id: "systems", name: "Whole-house systems" },
  { id: "final", name: "Final walkthrough & keys" },
];

const EVERY_ROOM = [
  ["er-doors", "Doors: open and close without scraping, stay put half-open, even gap, frame firm; lock works with every key; handles firm; door stop fitted"],
  ["er-door-finish", "Door finish (both faces and all edges, including frame and architrave): painted or finished evenly in the colour and sheen as per the agreed specification; no ridges, runs, brush marks, rough or missed patches"],
  ["er-windows", "Windows: open, close and lock; glass unscratched and to spec; seals complete; mosquito nets fitted without tears; track drain holes open; burglary proofs firm with key/release"],
  ["er-walls", "Walls and paint: flat and plumb; no cracks, hollow plaster, damp, mould or white salty marks; one even colour, no paint on sockets, switches, tiles or glass"],
  ["er-ceiling", "POP ceiling: cornices complete and even; no cracks or sagging; light fittings and fans fixed to secure support"],
  ["er-floor", "Floor: tiles level and evenly spaced, none cracked or mismatched; coin tap finds no hollow tiles; grout and skirting complete; no lips at thresholds"],
  ["er-sockets", "Sockets: tester shows correct wiring and earth; number and positions match the plan; flush, straight, uncracked"],
  ["er-lights", "Lights and switches: every light works without flicker; down = on throughout; two-way switches work from both ends; bulbs fitted"],
  ["er-fan", "Ceiling fan (if fitted): runs at all speeds with no wobble; regulator works"],
  ["er-ac", "Air conditioning (if fitted), tested on NEPA (grid) power: starts from remote; cool/fan/dry and swing work; air clearly cold within 10 min; no drips; quiet; pipes insulated; wall holes sealed"],
  ["er-data", "Data/TV points: where shown on the plan, and live"],
  ["er-pests", "Pests: no termite mud tubes; gaps around pipes and cables sealed"],
  ["er-finish-general", "General finishing: no poor workmanship anywhere in the room (uneven edges, gaps, rough patches, untidy silicone or grout, filler marks, misaligned covers or fittings); all finishes match the agreed description"],
  ["er-clean", "Clean: no paint, cement, adhesive or stickers on any surface"],
];

const BEDROOM = [
  ["bd-wardrobe", "Built-in wardrobe: level and fixed to wall; doors aligned and close softly; drawers run smoothly; hinges and handles tight; no swelling or peeling"],
  ["bd-rails", "Wardrobe hanging rails firm and level; shelves as designed; internal lights (if fitted) work; wardrobe locks work"],
  ["bd-bedside", "Enough sockets by the bed on both sides (number and positions as per the agreed specification electrical plan); bedside switches work; curtain rods or blinds fitted where agreed"],
];

const CLOSET = BEDROOM.slice(0, 2);

const BATHROOM = [
  ["bt-hotcold", "Hot water from the left/red side, cold from the right/blue; mixers turn hot in the marked direction"],
  ["bt-taps", "Taps turn off fully with no drip; aerators clean; flow strong"],
  ["bt-basin-leak", "No leaks under basin after 2 minutes running (tissue test on traps and connections)"],
  ["bt-basin-drain", "Basin plug holds and releases; basin drains quickly without gurgling"],
  ["bt-shower", "Shower (if fitted): temperature holds when another tap opens; head and hand shower spray evenly; diverter works"],
  ["bt-shower-drain", "Shower floor drains quickly; water stays inside the shower area; glass screen fixed and sealed"],
  ["bt-bath", "Bath (if fitted) fills, holds and drains; silicone continuous and mould-free"],
  ["bt-wc", "WC flushes fully on both buttons, refills and stops; pan firm and sealed; no leaks at cistern or hose; paper clears in one flush"],
  ["bt-flush", "Flush strength: a full flush clears the pan completely in one go (test with paper); the half flush clears liquids; cistern refills within about 2 minutes"],
  ["bt-faucet", "Health faucet works without dripping"],
  ["bt-falls", "Floor falls to the drain (marble test); every drain has a working trap; no sewer smell"],
  ["bt-fittings", "Extractor fan or opening window works; mirror, towel rail, toilet roll holder and shelves firm"],
  ["bt-fixtures", "No loose fixtures: push and pull each tap, mixer, shower head and rail, basin, WC pan and seat, mirror, towel rail, roll holder, shelf and glass screen — all firmly fixed"],
  ["bt-finish", "Vanity counter and pipework finish clean: counter edges and joints neat, silicone tidy, pipes and traps neatly run, clipped, and free of cement or paint; materials match the agreed description"],
  ["bt-door", "Door locks from inside and opens from outside in an emergency"],
];

const STAIR = "Stair risers and treads even; nosings firm; handrail rigid full length; balustrade gaps under 100 mm; stair lights two-way across all three floors";

const TERRACE = [
  ["tr-waterproof", "Waterproofing complete; flood test (water held 24 h where practical) shows no leaks in rooms below"],
  ["tr-falls", "Floor falls to outlets; outlets have grates and are clear; no ponding after a bucket test"],
  ["tr-railing", "Parapets and railings rigid, at least 1.0 m high (1.1 m recommended), gaps under 100 mm, nothing a child could climb"],
  ["tr-threshold", "Door threshold keeps rain out; tile skirting sealed"],
  ["tr-services", "Lights and weatherproof sockets (and tap where fitted) work"],
];

// [id, group, name, size m2, templates, specific checks ("; " separated)]
const ROOMS = [
  ["g-porch", "ground", "Entrance porch", "3.1", ["every"], "Front door is a security door: multi-point lock engages, hinges concealed, weather seal and threshold keep rain out; Digital lock works on code, card and key, has battery and emergency power terminal, admin code reset for the owner; Porch light works; Intercom/video doorbell rings indoors with two-way audio and video"],
  ["g-guest-wc", "ground", "Guest WC (by porch)", "", ["every", "bath"], "Extractor fan vents outside"],
  ["g-ante", "ground", "Ante room", "9.0", ["every"], ""],
  ["g-lounge", "ground", "Main lounge (with dining area)", "41.2", ["every"], "Double-height void: high windows open, close and can be reached for cleaning; High light fittings reachable for bulb changes; Ceiling cassette(s) level, grille aligned with POP; TV and data points live"],
  ["g-dining", "ground", "Dining area", "", ["every"], "Ceiling cassette level, grille aligned with POP; Pendant light point centred on table position"],
  ["g-gym", "ground", "Gym and storage (fit-out later)", "9.6", ["every"], "Shell only: walls, ceiling and screed level ready for later flooring; Sockets, AC or fan, and data point in place; Storage cupboard door and shelves"],
  ["g-bath-office", "ground", "Bath and WC (by gym)", "", ["every", "bath"], ""],
  ["g-bed1", "ground", "Bedroom 1", "12.5", ["every", "bed"], ""],
  ["g-lobby", "ground", "Lobby and stair", "8.0", ["every"], STAIR + "; Ceiling cassette level, grille aligned with POP; Stair rails sturdy: handrail and balustrade don't move when pushed and pulled firmly along the full length, all fixings tight; Stair tiles: no cracked, chipped, loose or hollow-sounding tiles on any tread, riser, nosing or landing (coin tap)"],
  ["g-kitchen", "ground", "Kitchen (with island)", "19.2", ["every"], "Cabinets level and fixed to wall; doors aligned; soft-close works; drawers not swollen; Quartz worktop level, uncracked, unchipped; joints and wall edge sealed; Sink holds water, drains quickly, no leaks underneath; waste trap accessible; Hot and cold taps the right way round, no drips; Hob: every burner lights with a steady blue flame; oven heats; grill works; Cooker hood works on all speeds, light works, vents outside; Built-in appliances power on and run a short cycle; Island sockets and lights work; worktop sockets a safe distance from sink and hob; Kitchen floor drain runs freely; Heat detector fitted and sounds on test; fire blanket and extinguisher present; Enough sockets along the backsplash and island: number and positions as per the agreed specification electrical plan; Gas cylinder can be connected to the cooker: cylinder space outside, pipe, regulator and shut-off valve fitted — test-connect a cylinder and light every burner; Concrete sink has no chips, cracks, rough or porous patches, is sealed, and matches the agreed description; Counter and piping finish clean: worktop edges and joints neat, silicone tidy, exposed pipes neatly run, clipped, free of cement or paint; Water dispenser: hot and cold water both dispense, no drips or leaks, water supply and drain connected, make and model as per the agreed specification; Microwave: heats a cup of water in 1 minute, turntable turns, light and timer work, door closes and seals, make and model as per the agreed specification; Hot plate: every zone heats up and each control works, on a suitable circuit, make and model as per the agreed specification; Heat extractor: runs on every speed, light works, filters fitted, vents outside where specified, make and model as per the agreed specification; Fridge/freezer: level and running, fridge cold (about 3–5 °C) and freezer frozen (about −18 °C) after a few hours, door seals close, light works, no unusual noise, make and model as per the agreed specification; Dishwasher: runs a short cycle, fills and drains, no leaks underneath, door panel aligned with the cabinets, make and model as per the agreed specification; Washing machine: runs a short cycle, fills and drains, no leaks, level with no rocking or walking, make and model as per the agreed specification; Gas oven: lights and stays lit, flame-failure safety cuts the gas when the flame goes out, thermostat heats to the set temperature, light and door seal work, make and model as per the agreed specification; Gas stove top: every burner lights with its igniter and gives a steady blue flame, flame-failure safety works on each burner, knobs turn smoothly, make and model as per the agreed specification; Quartz countertop: no cracks, chips or stains anywhere, including around the sink and hob cut-outs and along the edges; Cabinets: every door and drawer opens and closes smoothly, without catching, sticking or sagging; Woodwork: no damage to cabinet wood, doors or panels — no chips, dents, scratches, swelling, peeling or water damage"],
  ["g-pantry", "ground", "Pantry", "5.1", ["every"], "Shelves firm; Light works; Ventilation as agreed"],
  ["g-utility", "ground", "Utility room (laundry)", "6.4", ["every"], "Washing machine point has cold-water valve, waste pipe and dedicated socket; Short wash cycle runs with no leaks and drains properly; Floor drain runs freely"],
  ["g-maid", "ground", "Maid's room", "7.3", ["every", "bed"], ""],
  ["g-maid-bath", "ground", "Maid's bath and WC", "", ["every", "bath"], ""],
  ["f-landing", "first", "Stair hall and landing", "", ["every"], "Balustrade at the void edge rigid, at least 1.1 m high, no climbable rails; " + STAIR + "; Stair rails sturdy: handrail and balustrade don't move when pushed and pulled firmly along the full length, all fixings tight; Stair tiles: no cracked, chipped, loose or hollow-sounding tiles on any tread, riser, nosing or landing (coin tap)"],
  ["f-bed2", "first", "Bedroom 2", "18.8", ["every", "bed"], "Door to front terrace seals and locks"],
  ["f-bath2", "first", "Bath and WC (near Bedroom 2)", "5.0", ["every", "bath"], ""],
  ["f-bed3", "first", "Bedroom 3", "24.1", ["every", "bed"], "Door to long terrace seals and locks"],
  ["f-bath3", "first", "Bath and WC (near Bedroom 3)", "5.0", ["every", "bath"], ""],
  ["f-box", "first", "Box room", "", ["every"], "Shelves firm; Light works"],
  ["f-bed4", "first", "Bedroom 4", "28.5", ["every", "bed"], "Door to long terrace seals and locks"],
  ["f-bed4-closet", "first", "Bedroom 4 walk-in closet", "6.8", ["every", "closet"], "Light switch at the entrance"],
  ["f-bed4-bath", "first", "Bedroom 4 bath and WC", "8.2", ["every", "bath"], ""],
  ["f-bed5", "first", "Bedroom 5", "18.0", ["every", "bed"], "Door to side terrace seals and locks"],
  ["f-bed5-bath", "first", "Bedroom 5 bath and WC", "5.9", ["every", "bath"], ""],
  ["s-landing", "second", "Stair hall and landing", "", ["every"], STAIR + "; Door to terrace seals and locks; Stair rails sturdy: handrail and balustrade don't move when pushed and pulled firmly along the full length, all fixings tight; Stair tiles: no cracked, chipped, loose or hollow-sounding tiles on any tread, riser, nosing or landing (coin tap)"],
  ["s-master", "second", "Master bedroom", "31.5", ["every", "bed"], "Door to front terrace seals and locks"],
  ["s-closet", "second", "Master closet", "", ["every", "closet"], ""],
  ["s-bath", "second", "Master bath", "3.7", ["every", "bath"], ""],
  ["s-wc", "second", "Master WC", "3.7", ["every", "bath"], ""],
  ["s-cinema", "second", "Cinema", "23.9", ["every"], "Blackout on windows; Projector/TV, speaker and HDMI conduits and points where agreed; Dimmable lights work; Dedicated AV circuit; Acoustic treatment if specified; AC runs quietly"],
  ["s-kitchenette", "second", "Kitchenette", "", ["every"], "Cabinets and worktop level and fixed; Sink holds water, drains, no leaks; Sockets and fridge point; Light works; Heat detector fitted and sounds on test; Stoneware sink and worktop have no chips, cracks or crazing and match the agreed description; Enough sockets along the backsplash (as per the agreed specification electrical plan); Counter and piping finish clean: edges and joints neat, silicone tidy, pipes neatly run and free of cement or paint; Water dispenser: hot and cold water both dispense, no drips or leaks, water supply and drain connected, make and model as per the agreed specification; Microwave: heats a cup of water in 1 minute, turntable turns, light and timer work, door closes and seals, make and model as per the agreed specification; Hot plate: every zone heats up and each control works, on a suitable circuit, make and model as per the agreed specification; Heat extractor: runs on every speed, light works, filters fitted, vents outside where specified, make and model as per the agreed specification; Fridge/freezer: level and running, fridge cold (about 3–5 °C) and freezer frozen (about −18 °C) after a few hours, door seals close, light works, no unusual noise, make and model as per the agreed specification; Quartz countertop: no cracks, chips or stains anywhere, including around the sink and hob cut-outs and along the edges; Cabinets: every door and drawer opens and closes smoothly, without catching, sticking or sagging; Woodwork: no damage to cabinet wood, doors or panels — no chips, dents, scratches, swelling, peeling or water damage"],
  ["s-office", "second", "Office", "6.9", ["every"], "Enough sockets and a data point at the desk"],
  ["s-wc-office", "second", "WC (by office)", "", ["every", "bath"], ""],
];

const TERRACES = [
  ["t-ground", "Ground terrace (kitchen / maid's room)"],
  ["t-f-front", "First-floor front terrace (Bedroom 2)"],
  ["t-f-side", "First-floor side terrace (Bedroom 5)"],
  ["t-f-long", "First-floor long terrace (Bedrooms 3 and 4)"],
  ["t-s-front", "Second-floor front terrace (master bedroom)"],
  ["t-s-main", "Second-floor terrace (61 m²) and sit-out"],
];

// [id, group, name, items[]]
const OTHER = [
  ["x-perimeter", "external", "Perimeter, gate and grounds", [
    "Fence wall straight and plumb, no cracks, leaning sections or exposed blocks; coping complete",
    "Fence within the surveyed boundary (check against beacons)",
    "Gate (and motor, if fitted) opens fully, closes and locks; safety stop works; manual release key supplied",
    "Pedestrian gate (if fitted) opens, closes and locks",
    "Paving level, no sunken, cracked, rocking or missing blocks; kerbs firm",
    "Ground slopes away from the house on all sides; compound level above the street",
    "Car park fits the agreed number of cars; entrance clears a car with mirrors out",
    "Security and flood lights work, including sensors and timers",
    "Outdoor sockets weatherproof with covers fitted",
  ]],
  ["x-surface", "external", "Surface water", [
    "Drains and gutters open, connected and flowing to the street drain or soakaway",
    "Bucket test at several points: water drains away, no ponding near walls or the gate",
    "Drain covers fitted and car-rated where driven over; weep holes in fence wall open",
  ]],
  ["x-backyard", "external", "Backyard (landscaping later)", [
    "Outdoor sink firmly fixed; tap works without drips; splashback sealed to the wall",
    "Outdoor sink waste runs through a trap to the grey-water / grease-trap line, not onto the ground or into the septic tank",
    "Grease trap for kitchen and outdoor sink: accessible lid, clean, correctly connected",
    "Provisions for landscaping in place: garden tap(s), irrigation sleeve or capped pipe, outdoor socket, lighting conduit, as agreed",
    "Ground graded so later landscaping cannot push water toward the walls",
  ]],
  ["x-roof", "external", "Roof and roof space", [
    "Roofing sheets complete, straight, lapped; no dents, scratches or loose sheets",
    "Every fixing has a washer; none missing or rusting",
    "Ridge caps, flashings and valley gutters sealed",
    "Roof space: no daylight through sheets, no water stains, timbers termite-treated, insulation or sarking in place if specified",
    "Roof penetrations for solar PV, Solarwah and pipes sealed and flashed",
    "Fascia and soffits complete and painted, no gaps for birds, bats or rodents",
    "Lightning arrestor (if specified) fitted, down conductor connected to an earth pit",
  ]],
  ["x-walls", "external", "Gutters, downpipes and external walls", [
    "Gutters fall to downpipes, hold no standing water, no leaking joints (hose test)",
    "Downpipes firmly fixed, discharging into a drain or splash block, not against the wall",
    "Render smooth, no cracks, hollow patches (coin tap) or bulges",
    "Exterior tiles firm and uncracked; paint even, no overspray on windows, tiles or paving",
    "No damp or tide marks at the base of walls",
    "Daikin outdoor units and pipe runs fixed neatly; wall penetrations sealed",
    "General finishing outside: no poor workmanship (rough render, untidy joints, paint splashes, misaligned fittings); finishes match the agreed description",
  ]],
  ["y-electrical", "systems", "Electrical supply and distribution", [
    "Prepaid meter powered, accepts a token, shows credit",
    "Socket voltage roughly 220–240 V on a multimeter",
    "Every distribution board labelled circuit by circuit; each label matches what its breaker switches off (test every one)",
    "RCD/RCCB trips on its test button",
    "Main isolator, surge protection and voltage stabiliser/AVR (if fitted) installed and working",
    "Earth pit present and accessible; earth resistance reading (ideally below 5 Ω) — record it in the note",
    "No exposed wires or open knockouts in any board; covers fit",
    "Heavy loads (Daikin outdoor units, cooker, pumps, Solarwah backup element, washing machine) on their own breakers",
  ]],
  ["y-solar", "systems", "Solar PV, inverter, batteries and generator", [
    "Panels clean, uncracked, bolted to a rust-proof frame; not shaded by tanks, Solarwah or parapets",
    "DC cables UV-rated and in conduit; DC isolator and surge protection fitted; frames earthed",
    "Sunny midday solar input a reasonable share of rated power — record the reading",
    "Inverter in a cool, ventilated, dry place; no fault codes; app login handed to owner",
    "Settings recorded: solar first, battery cut-off, grid charging",
    "Backed-up circuits match the agreed list (lights, sockets, fridge, fans, CCTV, borehole pump if agreed); the ACs are not on the inverter",
    "Battery terminals tight and covered; DC breaker or fuse fitted; area ventilated and dry; charges fully and shows state of charge",
    "Backup test: grid off at the main isolator, normal evening load — record hours achieved",
    "Changeover: inverter takes over without TVs or routers rebooting; switches back and charges when grid returns",
    "Grid/inverter changeover labelled; electrician confirms the inverter cannot back-feed the grid line",
    "Emergency generator (not connected to the house): starts and runs; stored with its fuel away from the house; exhaust to be kept away from windows, doors and neighbours when used",
  ]],
  ["y-hotwater", "systems", "Solarwah solar hot water", [
    "Heat source: roof collectors undamaged, fixed, unshaded, no broken tubes — or PV panels, DC wiring, controller and isolator for the tank element fitted and labelled",
    "Central storage tank size matches the contract; mounted on a level, load-rated base; insulation intact",
    "Circulation pump and controller (if fitted) run; controller shows collector and tank temperatures; settings recorded",
    "Backup electric element works on its timer/thermostat, on its own breaker; owner shown how to switch it",
    "Temperature and pressure relief valve piped to a drain; expansion vessel and non-return valve fitted",
    "Mixing valve set so taps do not scald (about 50–55 °C at the tap); tank stored hot enough to limit bacteria (about 60 °C)",
    "Hot pipes insulated, especially on the roof; no leaks at any joint",
    "Hot water reaches the furthest tap on each floor within about 30–60 seconds",
    "Isolation and drain valves labelled; owner shown how to drain and descale",
  ]],
  ["y-ac", "systems", "Daikin air conditioning (2 outdoor units)", [
    "Model and capacity of every indoor and outdoor unit match the contract and the commissioning sheet",
    "Each indoor unit labelled with the outdoor unit it runs from",
    "All indoor units on outdoor unit 1 run together for 20 minutes on NEPA (grid) power and all cool properly",
    "All indoor units on outdoor unit 2 run together for 20 minutes on NEPA (grid) power and all cool properly",
    "Condensate drains outside or to a drain with a trap, never onto a wall, walkway or terrace",
    "Outdoor units on firm brackets or bases, with airflow and service space, shaded where possible, secured against theft",
    "Breakers and isolators match Daikin's wiring design; isolator near each outdoor unit",
    "Ceiling cassettes: panels level and flush with POP; all louvres swing",
    "Ceiling cassettes: condensate pump test — water poured into the drain pan is cleared with no overflow alarm",
    "Ceiling cassettes: access hatch in the POP near each one for servicing",
    "Ceiling cassettes: no staining on the POP around the cassette after running",
    "Wall units level so condensate runs to the drain side; no drips",
    "Sleeves or conduits in place where ACs are planned later",
    "Power source: every AC runs on NEPA (grid) power. ACs are not expected to run on solar — confirm none of the AC circuits are on the inverter",
    "Grid off test: with ACs switched on, turn NEPA off — the ACs stop (they are not on solar) and the inverter carries the rest of the house without overloading or tripping",
  ]],
  ["y-water", "systems", "Water supply (borehole, tanks, pumps)", [
    "Borehole head capped, raised and sealed; ideally 30 m or more from septic tank and soakaway",
    "Borehole pump starts and delivers steady flow; control panel has dry-run protection; runs on grid and inverter as agreed",
    "Tank sizes match contract; stand solid, level, rust-free; lids tight; overflow drains away from the building; tanks cleaned after construction",
    "Float switch starts and stops the pump through a full cycle; float valves shut off fully",
    "Water treatment running; owner shown backwash and filter change",
    "Water clear at the taps (white cup test); booster pump starts and stops without cycling",
    "Top-floor pressure good with the highest shower and a ground-floor tap open together",
    "Main stop valve and per-bathroom/kitchen isolation valves labelled and turn easily",
    "Leak test: all taps closed, tank level unchanged after 2–3 hours",
    "Borehole pump full-cycle test: from a low tank, the pump starts, fills the tank with steady flow (no spluttering air), and stops when full; no unusual noise; dry-run protection cuts out as designed; works on inverter power — record the fill time",
    "Water pressure: pressure gauge reading at a tap on each floor (record the readings); strong flow from the top-floor shower with a ground-floor tap open at the same time; booster pump doesn't keep switching on and off",
  ]],
  ["y-drainage", "systems", "Drainage, septic tank and soakaway", [
    "All taps run and all WCs flushed together: nothing backs up, gurgles or overflows",
    "Inspection chambers accessible with covers; water flows through cleanly, no debris",
    "Septic tank and soakaway positioned as drawn, with openable covers for desludging; vent pipe above roof with mosquito cap",
    "Rainwater kept out of the septic tank; grey water routed as designed",
    "No sewage smell anywhere in the compound",
  ]],
  ["y-fire", "systems", "Fire safety and cooking gas", [
    "Smoke detectors in halls and near bedrooms on all three floors; each sounds on test",
    "CO detector near gas appliances",
    "Extinguishers (CO₂ or dry powder) near boards, inverter and kitchen, in date; fire blanket in kitchen",
    "Escape route from every bedroom; at least one openable exit per floor; burglary proofs on escape windows have a quick release",
    "Gas cylinder outside in a ventilated spot; pipe copper or approved hose, clipped, sleeved through the wall",
    "Regulator and shut-off valve easy to reach; soapy-water test on every joint shows no bubbles",
  ]],
  ["y-security", "systems", "CCTV, access, internet and smart devices", [
    "Camera count and positions match contract; gate, doors, car park, fence line and terraces covered",
    "Live view on recorder and phone; sharp image; night vision usable after dark",
    "Playback from an hour earlier works for each camera; date and time correct; record days of storage in the note",
    "Recorder hidden, ventilated, on inverter or UPS; stays on in a power cut",
    "Cables in conduit; cameras out of easy reach; admin passwords changed and handed to owner",
    "Gate release from intercom works (if fitted)",
    "Wi-Fi router and access points cover all three floors and the second-floor terrace",
    "Smart devices and alarm (if fitted) work from app and manually; accounts transferred to owner",
    "CCTV camera — Kitchen: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — Entrance: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — Living area (main lounge): installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — Stairway: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — First-floor landing: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — Second-floor landing: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — Front of house: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — Side of house: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
    "CCTV camera — Back of house: installed, live on the recorder and phone app, sharp by day, usable at night, covering the agreed view",
  ]],
  ["z-final", "final", "Final walkthrough", [
    "House fully cleaned; no paint, cement, tile adhesive or stickers anywhere",
    "Builder's rubbish, materials and temporary connections removed from house, compound and roof",
    "Electricity meter reading — record it in the note",
    "Photos or video of every room taken on the day",
    "Final walk-round for poor finishing: doors, counters, pipework, sockets and switch plates, silicone, grout and paint all neat and as described",
  ]],
  ["z-keys", "final", "Keys and access items (record counts)", [
    "External door keys (front, kitchen/back, terrace doors) — record count",
    "Internal door keys — record count",
    "Burglary proof, gate and padlock keys — record count",
    "Distribution board and meter box keys — record count",
    "Digital lock cards/fobs and emergency keys — record count",
    "Gate remotes, AC remotes, fan remotes — record count",
    "Passwords and app logins handed over: CCTV, inverter, Solarwah, Daikin, alarm, smart home, Wi-Fi",
    "After-sales contacts handed over: developer, solar PV, Solarwah, Daikin installer, CCTV, borehole",
  ]],
];

const TEMPLATES = { every: EVERY_ROOM, bed: BEDROOM, closet: CLOSET, bath: BATHROOM };

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function build() {
  const areas = [];
  for (const [id, group, name, size, tpls, specific] of ROOMS) {
    const items = [];
    for (const t of tpls) for (const [iid, text] of TEMPLATES[t]) items.push({ id: iid, text });
    specific.split(/;\s*/).filter(Boolean).forEach((text, i) => {
      const t = text.charAt(0).toUpperCase() + text.slice(1);
      items.push({ id: `sp${i + 1}-${slug(t).slice(0, 20)}`, text: t });
    });
    areas.push({ id, group, name, size, items, kinds: tpls });
  }
  for (const [id, name] of TERRACES) {
    areas.push({ id, group: "external", name, size: "", kinds: ["terrace"], items: TERRACE.map(([iid, text]) => ({ id: iid, text })) });
  }
  for (const [id, group, name, list] of OTHER) {
    areas.push({
      id, group, name, size: "", kinds: [group],
      items: list.map((text, i) => ({
        id: `i${String(i + 1).padStart(2, "0")}`,
        text,
        noteRequired: /record (it|the|hours|count|days)/i.test(text),
      })),
    });
  }
  return areas;
}

export const AREAS = build();
export const AREA_BY_ID = Object.fromEntries(AREAS.map((a) => [a.id, a]));

// Groups of areas the owner can add a new check to in one go.
export const TARGETS = [
  { id: "every", name: "Every room (all 34 rooms)" },
  { id: "bath", name: "All bathrooms and WCs" },
  { id: "bed", name: "All bedrooms" },
  { id: "closet", name: "All walk-in closets" },
  { id: "terrace", name: "All terraces" },
];
export const areasForTarget = (t) => AREAS.filter((a) => a.id === t || a.kinds.includes(t));
