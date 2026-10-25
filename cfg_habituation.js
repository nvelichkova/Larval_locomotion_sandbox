// Does boundary habituation reduce time at the wall? Re-measured with seeds
// that actually take effect.
module.exports = {
  duration: 900, seeds: 20, tracks: false,
  base: { aw: 100, ah: 50 },
  conditions: {
    none: { params: { cdose: 0, tdes: 600 } },
    cam0: { buttons: ['h_cam'] },
    wt:   { buttons: ['h_wt'] },
    dnc:  { buttons: ['h_dnc'] },
    rut:  { buttons: ['h_rut'] },
  },
};
