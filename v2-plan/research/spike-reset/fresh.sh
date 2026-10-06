#!/bin/zsh
# restore the unit checkpoint fixture
printf '# Unit checkpoint\nunits_done: 0\nMarker: UNIT-MARKER-BRAVO.\n' > ${0:A:h}/work/checkpoints/unit.md
