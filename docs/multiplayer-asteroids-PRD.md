# PRD: Multiplayer Adaptation for Asteroids

## Summary

Extend the existing polished single-player Asteroids game into a shared multiplayer experience that works well on desktop, ultrawide, tablet, and mobile displays.

This project should preserve the existing game’s opinionated feel, controls, pacing, visual language, and core appeal. It is **not** a request to redesign Asteroids into a generic online arena shooter. The work is to establish the technical and product foundations that allow multiple players to occupy, perceive, and interact within the same seamless Asteroids world—without making the experience feel compromised on smaller screens or unusually wide displays.

The senior developer should make the appropriate implementation and gameplay decisions within the principles below. Specific mechanics, modes, balancing numbers, networking architecture, UI designs, and camera tuning are intentionally not prescribed here.

## Problem

The current game assumes one player and one viewport. A multiplayer version introduces several interconnected problems:

- Multiple players must participate in the same coherent world state.
- The Asteroids convention of screen-edge wrapping must remain understandable, consistent, and fair when players have independent cameras and different screen sizes.
- A fixed whole-arena view may work for a small desktop display, but becomes difficult to read on mobile and creates uneven advantages across aspect ratios and monitor sizes.
- A player-centred camera improves local readability but means users will not always see all other players or game activity directly.
- Wide screens, ultrawide screens, tablets, and phones expose different amounts of world space and have different input constraints.
- Online movement, projectile combat, collision, and score/state changes must feel responsive even with ordinary consumer-network latency.

The goal is to turn these constraints into a coherent multiplayer spatial model rather than layering networking onto a single-player camera and playfield.

## Goals

- Support multiple simultaneous players in a single shared Asteroids session.
- Preserve the defining wraparound-space character of Asteroids.
- Ensure that wrapping is logically consistent for player movement, asteroids, projectiles, collisions, effects, targeting, and any future interactive objects.
- Allow each player to have a local viewport suited to their device without creating separate game worlds.
- Make the game playable and legible across desktop, widescreen, ultrawide, tablet, and mobile form factors.
- Maintain an immediate, responsive feel for the locally controlled ship.
- Ensure that multiplayer state remains consistent, robust against latency, and resistant to obvious forms of client-side cheating.
- Create a foundation that can support future game modes, teams, objectives, spectators, bots, persistence, matchmaking, or social features without requiring a fundamental rewrite.
- Keep the existing single-player experience available and avoid degrading it unnecessarily.

## Non-goals

This project does not require the developer to:

- Invent a final multiplayer mode, progression system, economy, battle pass, ranking system, or monetisation strategy.
- Specify exact player limits, arena dimensions, weapon values, ship statistics, scoring rules, or match duration.
- Rebuild the game’s art direction, sound design, ship controls, existing asteroid behaviour, or core combat loop unless multiplayer requirements make a targeted change necessary.
- Guarantee perfectly equal competitive conditions between touch and mouse/keyboard users in the first release.
- Implement every possible device orientation, controller type, accessibility feature, or social feature before a usable multiplayer foundation exists.
- Make all users see the entire shared map at once.
- Preserve every single-player implementation detail if it conflicts with authoritative multiplayer simulation, cross-device usability, or reliable world-state synchronisation.

## Product Principles

### One world, many views

Every participant is in one shared game world. Players do not receive separate instances, mirrored arenas, or client-specific versions of the simulation.

Each player may have an independent camera, viewport, HUD, and input method. These individual views are windows into the same world, not evidence of separate maps.

A player’s inability to see another player on their screen does not mean that player is absent. The product should provide enough spatial awareness, visual language, or game design support for offscreen activity to remain understandable where it matters.

### Treat wraparound as world geometry

Asteroids’ wrapping behaviour should not be treated as a teleport effect or a special exception applied at screen edges. The game world should behave as a continuous toroidal space: opposite horizontal borders are adjacent, and opposite vertical borders are adjacent.

The flat rectangle is only a representation of the world. A ship near the left boundary may be physically close to a ship near the right boundary. The same principle applies to all relevant entities and interactions.

This has implications beyond movement:

- Distance must be interpreted through the shortest valid wrapped route.
- A projectile can be a valid threat across a visible seam.
- Collision and proximity logic must treat opposite edges as adjacent.
- Rendering may show an entity in more than one place locally where required to maintain a seamless visual result.
- Any lines, effects, indicators, or AI logic that connect world entities should respect wrapped proximity rather than raw rectangular coordinates.

The user should perceive continuity, not discontinuity.

### The camera serves the player

The camera should support readable play rather than insist that the ship be perfectly centred at all times.

The preferred direction is a player-following camera with a tolerance area: the player ship may move naturally within a central region before the camera catches up. As the ship moves farther from the preferred region, the camera can follow more strongly; as it returns, camera motion should settle smoothly.

This approach should preserve a sense of inertia and movement while keeping the ship visible and combat readable. It should avoid:

- Constant low-level camera jitter.
- Hard snaps during normal thrust, turns, or wrapping.
- Camera motion that feels slower than the ship at meaningful travel speeds.
- A situation where a user loses their ship near the edge of the screen.
- A camera that exaggerates ordinary multiplayer network jitter.

The local player’s predicted or authoritative local state should drive the camera. Remote-player interpolation should not cause camera movement.

### Device view is not world size

Different screen sizes and aspect ratios should change presentation, not the underlying world, rules, or authoritative simulation.

The game should account for the fact that an ultrawide desktop display can show much more horizontal space than a phone, while a portrait-oriented phone may create an unsuitable play area for a fast top-down action game.

The implementation should establish a clear policy for:

- Effective world-space field of view.
- Maximum or bounded advantage from wider displays.
- Preferred and supported mobile orientations.
- HUD placement and safe areas.
- Touch-control obstruction of game space.
- Readability of ships, hazards, projectiles, health/state indicators, and objectives.
- Offscreen awareness on limited viewports.

The goal is not necessarily identical pixels or identical viewing area on every device. The goal is a fair, intelligible, and enjoyable experience on each supported device class.

### Local responsiveness, shared authority

The local player should experience input and movement as immediate. At the same time, the game needs a trusted shared outcome for movement, combat, collisions, score changes, and other consequential state.

The developer should select an appropriate authority, prediction, interpolation, reconciliation, tick-rate, and transport model. The resulting design should prioritise:

- Responsive local movement and firing.
- Consistent resolution of combat events.
- Tolerable behaviour under ordinary latency, jitter, packet loss, backgrounding, and reconnection.
- Protection against straightforward client manipulation.
- Clear recovery behaviour when a player reconnects, joins late, dies, respawns, or temporarily loses connectivity.

The multiplayer model should be designed as a game simulation rather than as a visual state-sharing layer.

### Preserve readability under action

Single-player Asteroids can rely on a single player’s view and a modest number of visible objects. Multiplayer increases the number of ships, projectiles, effects, and important states competing for attention.

The multiplayer adaptation should preserve immediate readability:

- Users should quickly distinguish their own ship from other ships.
- Nearby threats should be understandable, including threats across a wrap seam.
- Important actions should have clear feedback.
- UI should not obscure core navigation or combat space.
- Visual effects should support rather than bury state information.
- The game should remain understandable during high-speed movement and brief moments of visual density.

The developer may use visual hierarchy, audio cues, radar/minimap concepts, directional indicators, adaptive UI, effect-budgeting, or other appropriate approaches. The PRD does not mandate a particular solution.

## Target Experience

A player should be able to join a multiplayer session and immediately understand that they are flying in a shared field of continuous space.

They should be able to:

- Move, rotate, thrust, fire, and interact with the game using the game’s established control philosophy.
- Cross an apparent viewport or world seam without a jarring shift in camera, motion, or gameplay.
- Encounter other players and objects consistently near either side of a wrapped boundary.
- Understand enough about nearby and relevant offscreen activity to make meaningful decisions.
- Play effectively on a desktop browser and on a suitable mobile layout without the game becoming visually cramped or mechanically confusing.
- Recover gracefully from normal connection interruptions or app/browser lifecycle events.
- Return to or continue playing the existing single-player version without multiplayer dependencies creating unnecessary friction.

A player should not need to understand topology, coordinate systems, networking, or camera terminology to understand the game.

## Requirements

### Shared simulation

- Establish a shared session/room model for multiple concurrent participants.
- Define an authoritative source of truth for consequential game state.
- Support synchronisation of player ships, asteroids, projectiles, collisions, eliminations, score/state, and any multiplayer-relevant world entities.
- Ensure late joins, disconnections, reconnects, and clean departures have defined outcomes.
- Keep the simulation model extensible enough to support future entities and modes.
- Avoid coupling core simulation correctness to a specific viewport, screen resolution, or client rendering frame rate.

### Toroidal world behaviour

- Preserve seamless horizontal and vertical world wrapping.
- Apply equivalent wrapped-world logic consistently across relevant systems.
- Avoid visible discontinuities as a local player or remote entity crosses a world boundary.
- Support correct interaction across seams, including collision, projectile travel, proximity, targeting, effects, and rendering.
- Ensure the world remains coherent if a player’s camera follows them across a canonical map boundary.
- Provide appropriate debugging tools or developer views to verify wrapped distance, seam interactions, entity duplication for rendering, and collision behaviour.

### Camera and presentation

- Support a local player-centred camera suitable for a multiplayer shared world.
- Allow controlled camera lag, tolerance/dead-zone behaviour, smooth follow, and appropriate acceleration/deceleration.
- Support visual continuity around wrap boundaries.
- Provide a strategy for offscreen awareness that remains useful without becoming distracting.
- Ensure important rendering elements—including ships, collision shapes, projectile trails, explosions, beams, indicators, and UI markers—behave correctly at seams.
- Keep camera and screen effects independent from remote-client network jitter.
- Support future camera modes such as spectating, replay, kill-cam, or follow-camera functionality where practical.

### Cross-device support

- Define supported browser/device classes and minimum viable viewport sizes.
- Support desktop and wide desktop displays without allowing uncontrolled information advantage.
- Support touch-first mobile play in a way that is deliberately designed rather than merely scaled down.
- Respect mobile safe areas, browser chrome changes, dynamic viewport height, and orientation changes.
- Ensure core controls, visual feedback, and pause/background handling are usable on mobile.
- Make HUD and controls responsive to viewport dimensions, input method, and device class.
- Identify intentional unsupported configurations rather than leaving them to accidental behaviour.

### Multiplayer UX

- Provide a minimum viable flow for entering, joining, leaving, and rejoining a multiplayer session.
- Make connection state understandable without overly technical messaging.
- Communicate loading, waiting, ready, disconnected, reconnecting, eliminated, and match-complete states appropriately.
- Allow players to distinguish themselves from others through a clear visual system.
- Provide enough identity/state information for multiplayer play without making the screen feel like a dashboard.
- Ensure the single-player route remains straightforward and does not require multiplayer setup.

### Observability and testing

- Add development tooling sufficient to inspect multiplayer correctness.
- Support local multi-client testing with independently controlled players and cameras.
- Provide configurable simulated latency, jitter, packet loss, disconnection, and reconnection conditions.
- Make it possible to observe canonical world positions alongside local rendered equivalents.
- Instrument core multiplayer failures and quality signals, including connection errors, desynchronisation indicators, reconciliation frequency, abnormal latency, match abandonment, device type, viewport class, and input method.
- Establish enough automated coverage for wrapped-world maths and high-value multiplayer state transitions.

## Key Acceptance Criteria

The implementation is ready for product testing when the following are demonstrably true:

- Two or more players can join the same session and observe coherent shared state.
- Players can cross all world boundaries without their own movement, camera, or nearby objects appearing to discontinuously teleport.
- Two entities placed near opposite canonical edges correctly behave as near neighbours when wrapping makes them adjacent.
- Projectiles, collision detection, effects, and relevant interaction logic work across world seams.
- Each client can use a local camera without affecting the shared simulation or another player’s camera.
- Camera movement is smooth enough that ordinary movement does not produce jitter, harsh snaps, or a persistently edge-bound player ship.
- A mobile player can enter, control, understand, and complete the core gameplay loop on a supported device configuration.
- Desktop, wide desktop, and mobile presentations remain readable and intentionally constrained rather than merely stretched.
- Brief latency, jitter, disconnect, backgrounding, and reconnection scenarios do not corrupt the match or produce ambiguous permanent states.
- Existing single-player play remains functional and retains its established feel unless an intentional, documented change is necessary.
- The codebase has a clear separation between authoritative simulation, networking, local prediction/presentation, camera logic, device-specific controls, and UI.

## Open Decisions

The developer should propose options and a recommendation for these decisions before implementation becomes difficult to reverse:

- Target multiplayer scale: intimate duels, small sessions, larger arena matches, or a staged approach.
- Room/session model: private rooms, quick play, public lobbies, invite links, bots, matchmaking, or some combination.
- Server authority and deployment model.
- Networking transport and fallback strategy.
- Simulation tick rate and client rendering/prediction model.
- Whether the first mobile release supports landscape only or supports both orientations.
- Input policy across touch, mouse/keyboard, controller, and any aim assistance.
- Field-of-view policy across common desktop, ultrawide, tablet, and phone aspect ratios.
- Minimum device/browser performance targets.
- First-session multiplayer loop and match lifecycle.
- Whether cross-device competition is enabled initially, separated into queues, or handled through adaptive balancing.
- Spectator, replay, social, persistence, cosmetic, and progression scope.
- Security, abuse prevention, player identity, moderation, and rate-limiting requirements for the first public release.

## Delivery Approach

The work should be delivered in incremental milestones that preserve a testable game at each stage.

1. **Multiplayer technical spike**  
   Validate authoritative shared simulation, toroidal world semantics, multiple independent local cameras, and a minimal two-client session.

2. **Playable internal multiplayer build**  
   Support a complete minimal multiplayer loop with basic joining, leaving, synchronisation, cross-seam interactions, and observable connection states.

3. **Cross-device playability pass**  
   Establish deliberate desktop, widescreen, tablet, and mobile behaviour; validate controls, viewport policy, HUD, safe areas, and performance.

4. **Reliability and fairness pass**  
   Test adverse network conditions, reconnects, browser/mobile lifecycle events, input disparities, field-of-view policy, and obvious cheating vectors.

5. **Product-test build**  
   Deliver instrumentation, diagnostics, test scenarios, known limitations, operational notes, and a recommended roadmap for the next multiplayer features.

## Success Measures

Success should be judged initially by whether multiplayer feels coherent and worth playing, not merely by whether packets are exchanged correctly.

Useful early measures include:

- Successful join and session completion rate.
- Median and high-percentile client latency, jitter, and reconnection outcomes.
- Frequency and severity of visual or simulation desynchronisation.
- Rate of camera-related usability complaints, including disorientation, motion discomfort, loss of ship visibility, and seam confusion.
- Match abandonment rate by device class, aspect ratio, input method, and network quality.
- Relative performance and retention between desktop and mobile users.
- Frequency of reports or telemetry patterns suggesting a dominant field-of-view or input-method advantage.
- Qualitative playtest feedback on whether the world feels shared, seamless, readable, and recognisably like Asteroids.

## Guiding Constraint

The implementation should make the multiplayer world feel **continuous, shared, responsive, and legible**.

The player should not experience the system as “a rectangular game map that teleports things at the edges,” “a mobile version with less game,” or “a desktop version where the widest screen wins.” They should experience a common field of space, viewed through a device-appropriate cockpit window, where the original Asteroids rules remain intuitive even when many people are playing at once.
