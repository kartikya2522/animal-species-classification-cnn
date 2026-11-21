# Data and image licences

The **code** in this repository is under the MIT License (`LICENSE`). The data and images below
come from third parties and keep their own licences.

## `data/species_kb.json` (species knowledge base)

Built by `scripts/build_species_kb.py`; every entry records where its fields came from.

| Content | Source | Licence |
|---|---|---|
| `summary`, `description` (article intros) | [Wikipedia](https://en.wikipedia.org/) via the REST API | Text under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/); attribution = the article linked in `wikipedia_url` (its authors are listed in the article history). Reuse must keep the attribution and share alike. |
| Scientific names, IUCN status (P141), taxon names (P225) | [Wikidata](https://www.wikidata.org/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Taxon ids, taxonomy, common names, observation counts | [iNaturalist API](https://api.inaturalist.org/v1/docs/) | Factual metadata used under the iNaturalist API terms; linked back via `inaturalist_taxon_id`. |
| GBIF taxonKey; occurrence map tiles shown on profiles | [GBIF](https://www.gbif.org/) species API and Maps API | Metadata used under the GBIF terms of use; occurrence data licences vary by dataset (CC0 / CC BY / CC BY-NC) and are credited on the map. |
| IUCN Red List categories | IUCN Red List, as published through Wikidata / iNaturalist | Category labels only; see <https://www.iucnredlist.org/terms/terms-of-use>. |
| `image` (lead photo per species) | [Wikimedia Commons](https://commons.wikimedia.org/) | Each file's own licence, stored with it (`artist`, `license`, `license_url`, `source_url`) and shown under the photo wherever it appears. |

The Field Guide chat quotes the same Wikipedia text (and live Wikipedia intros for other animals);
retrieval-only answers end with a CC BY-SA 4.0 notice and every answer lists its sources.

## Photos in the app

- `frontend/public/samples/*.jpg` (Identify samples) and `frontend/public/images/hero-red-panda.jpg`
  (home page) are **resized copies** of Wikimedia Commons files under their stated licences
  (credits in `frontend/src/lib/samples.json` and on the pages, marked "resized").
- `data/species_images/` (local photo cache, gitignored) holds resized copies of the KB photos,
  credited the same way as the originals.
- `frontend/src/fixtures/red-panda.jpg` is a resized copy of a CC0 Commons photo (Mathias Appel).

## Training data

The Animal-80 dataset (Open Images via Kaggle) used to train the models is not redistributed here;
see its source for licence terms (Open Images annotations CC BY 4.0, images listed as CC BY 2.0).
