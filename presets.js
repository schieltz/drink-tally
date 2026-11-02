// Default drinks. Std values are computed from oz and ABV in logic.js, never hard-coded.
// type "spirit": the base component changes with the pour stepper and shot chips.
// type "pour": size and ABV chips change the single component.

export const DEFAULT_PRESETS = [
  {
    id: 'martini',
    name: 'Martini',
    type: 'spirit',
    components: [
      { name: 'Vodka or gin', oz: 2.5, abv: 40, base: true },
      { name: 'Dry vermouth', oz: 0.5, abv: 18 },
    ],
    chips: { shots: [1, 2, 3] },
  },
  {
    id: 'vodka-soda',
    name: 'Vodka soda',
    type: 'spirit',
    components: [{ name: 'Vodka', oz: 1.5, abv: 40, base: true }],
    chips: { shots: [1, 2, 3] },
  },
  {
    id: 'orange-crush',
    name: 'Orange Crush',
    type: 'spirit',
    components: [
      { name: 'Orange vodka', oz: 2, abv: 35, base: true },
      { name: 'Triple sec', oz: 2, abv: 20 },
    ],
    chips: { shots: [1, 2, 3] },
  },
  {
    id: 'cocktail',
    name: 'Cocktail',
    type: 'spirit',
    components: [{ name: 'Spirit', oz: 2, abv: 40, base: true }],
    chips: { shots: [1, 2, 3] },
  },
  {
    id: 'hard-seltzer',
    name: 'Hard seltzer',
    type: 'pour',
    components: [{ name: 'Hard seltzer', oz: 12, abv: 5 }],
    chips: { sizes: [12, 16, 24], abvs: [4.5, 5, 8] },
  },
  {
    id: 'canned-cocktail',
    name: 'Canned cocktail',
    type: 'pour',
    components: [{ name: 'Canned cocktail', oz: 12, abv: 7 }],
    chips: { sizes: [12, 16], abvs: [4.5, 7, 10, 12] },
  },
  {
    id: 'champagne',
    name: 'Champagne',
    type: 'pour',
    components: [{ name: 'Champagne', oz: 5, abv: 12 }],
    chips: { sizes: [4, 5, 6], abvs: [] },
  },
  {
    id: 'wine',
    name: 'Wine',
    type: 'pour',
    components: [{ name: 'Wine', oz: 5, abv: 13 }],
    chips: { sizes: [5, 6, 9], abvs: [] },
  },
  {
    id: 'beer',
    name: 'Beer',
    type: 'pour',
    components: [{ name: 'Beer', oz: 12, abv: 5 }],
    chips: { sizes: [12, 16], abvs: [4, 5, 7] },
  },
];
