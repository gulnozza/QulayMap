# 00 — Product Brief

**QulayMap Uzbekistan** ("qulay" = convenient/comfortable in Uzbek) is a community-owned mapping and route-planning platform. Verified organizations publish map collections; residents find places and plan routes using the layers that matter to them.

## North star

> Everyone should be able to plan a trip around what makes a route usable for **them** — not what a generic map assumes is convenient.

## Users and surfaces

| Surface | Primary user | Outcome |
|---|---|---|
| **Explore** | Residents and visitors | Search, toggle layers on/off, get routes reflecting personal needs |
| **Contribute** | Community members | Add a location, condition, photo, or correction with source + recency date |
| **Organization Studio** | Nonprofits and civic groups | Create a map, define categories, invite reviewers, publish a shareable public layer |
| **Insights** | Partners and advocates | Coverage, reporting trends, areas needing verification or investment |

## Launch collections (pilot)

- **Access UZ** — accessible entrances, ramps, elevators, accessible toilets, curb ramps, obstacle reports
- **Care UZ** — public toilets, menstrual-health resource points, water/refill points, with opening hours + source/recency
- **One dynamic route layer** — construction / sidewalk closures. Lighting is added as the second route preference only after the first works end-to-end.

## Layer behaviors (the core mechanic)

| Layer type | Route behavior | Example |
|---|---|---|
| Hard constraint | Route must avoid it | Sidewalk closure; require step-free access |
| Soft preference | Cost penalty or reward | Prefer lit streets; prefer active corridors |
| Informational | Shown on map, no routing effect | Menstrual-health products, water refill points |
| Destination filter | Changes eligible destinations | Only places with accessible restrooms |

## Routing formula (expose it in human terms)

```
route cost = travel time
           + construction_penalty
           + accessibility_penalty
           − lighting_reward
           − activity_reward
```

User-facing: *"This route is 5 minutes longer but avoids two reported construction segments; 78% of segments have recently reviewed lighting data."*

## Trust states

| State | Meaning | Treatment |
|---|---|---|
| `community_submitted` | Resident added, awaiting review | "Unverified" label |
| `org_reviewed` | Moderator checked report/source | Review date + org name |
| `community_confirmed` | Multiple independent recent confirmations | Confidence badge + latest date |
| `needs_recheck` | Old / contested / possibly changed | Visible, weakly weighted in routing |

## Hard product boundaries

1. Never claim a route is "safe" or predict crime. Lighting/activity are signals.
2. Submissions describe places and conditions — never personal reports about individuals.
3. Never auto-claim accessibility via AI. Specific observed features + dates, not vague badges.
4. Sensitive resources can be approximate, private, or excluded from public search.
5. Minimal data collection: no precise travel history by default.

## Pilot success measures

- 100+ verified locations across two collections in the pilot area
- 25+ community submissions reviewed within a defined SLA
- Usability test with wheelchair users, students, and nonprofit moderators
- One partner uses a public share link, embed, or gap report in their own work

## The demo story (build toward this)

A wheelchair user plans a trip to a public resource in the pilot area. They turn on **Access UZ**, choose "avoid construction," prefer well-lit streets. QulayMap presents two routes, explains the tradeoffs, and shows the date + verification status of the accessibility data. On arrival they confirm or correct the location. A nonprofit moderator reviews that report in Organization Studio.

One coherent story: community knowledge is collected responsibly, verified by the right people, and turned into a better real-world decision.
