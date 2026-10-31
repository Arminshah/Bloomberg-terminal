// SPDX-License-Identifier: LicenseRef-PolyForm-Strict-1.0.0
// Copyright (c) 2026 Armin. Non-commercial use only; no copying into other work, changes or redistribution. See LICENSE.
import { favourites, toggleFavourite } from '../terminal/userdata';

/** The star beside a security: on, it is one of your favourites (FAVOURITES), offered first on the command line. */
export function FavStar({ id }: { id: string }) {
  const on = favourites.use((s) => s.ids.includes(id));
  return (
    <button
      type="button"
      className={`fav-star${on ? ' on' : ''}`}
      aria-pressed={on}
      aria-label={on ? `Remove ${id} from favourites` : `Add ${id} to favourites`}
      title={on ? `${id} is a favourite: click to remove it` : `Add ${id} to your favourites: the command line offers them as soon as you click it`}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavourite(id);
      }}
    >
      {on ? '★' : '☆'}
    </button>
  );
}
