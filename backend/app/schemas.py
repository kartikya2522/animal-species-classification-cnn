"""Pydantic response models (also drive the OpenAPI schema at /docs)."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ErrorResponse(BaseModel):
    detail: str = Field(..., examples=["Could not decode the uploaded file as an image."])


# ---------------------------------------------------------------- health / models
class ModelStatus(BaseModel):
    id: str
    loaded: bool
    error: Optional[str] = None


class HealthResponse(BaseModel):
    status: str = Field(..., description="'ok' if the default model is loaded, else 'degraded'.", examples=["ok"])
    version: str = Field(..., examples=["0.1.0"])
    default_model: str = Field(..., examples=["efficientnetv2_s"])
    models: List[ModelStatus]


class TestMetricsSummary(BaseModel):
    test_accuracy: Optional[float] = Field(None, examples=[0.8321])
    test_top5_accuracy: Optional[float] = Field(None, examples=[0.9847])
    macro_f1: Optional[float] = Field(None, examples=[0.769])
    macro_roc_auc: Optional[float] = Field(None, examples=[0.9941])
    test_samples: Optional[int] = Field(None, examples=[7576])


class ModelInfo(BaseModel):
    id: str = Field(..., examples=["efficientnetv2_s"])
    display_name: str = Field(..., examples=["EfficientNetV2-S"])
    architecture: str
    variant: str = Field(..., description="Served ONNX variant (only `usable` variants are served).", examples=["fp32"])
    num_classes: int = Field(..., examples=[80])
    input_size: List[int] = Field(..., examples=[[224, 224]])
    loaded: bool
    supports_explain: bool
    is_default: bool
    test_metrics: TestMetricsSummary


class ModelsResponse(BaseModel):
    default: str = Field(..., examples=["efficientnetv2_s"])
    models: List[ModelInfo]


# ---------------------------------------------------------------- predict / explain
class Prediction(BaseModel):
    label: str = Field(..., examples=["Zebra"])
    index: int = Field(..., description="Class index in models/classes.json order.", examples=[79])
    probability: float = Field(..., ge=0.0, le=1.0, examples=[0.97])


class ImageInfo(BaseModel):
    width: int = Field(..., description="Width after EXIF orientation is applied.", examples=[1024])
    height: int = Field(..., examples=[683])
    format: str = Field(..., examples=["JPEG"])


class PredictResponse(BaseModel):
    model: str = Field(..., examples=["efficientnetv2_s"])
    predictions: List[Prediction] = Field(..., description="Top-k classes, highest probability first.")
    low_confidence: bool = Field(
        ...,
        description="True when the top-1 probability is below `low_confidence_threshold`: "
        "the photo may not show one of the supported species, or may be ambiguous.",
    )
    low_confidence_threshold: float = Field(..., examples=[0.5])
    inference_ms: float = Field(..., description="Preprocessing + forward pass + softmax, server-side.", examples=[38.2])
    image: ImageInfo
    slugs: Dict[str, str] = Field(
        default_factory=dict,
        description="Species-atlas slug for each returned label (`GET /api/species/{slug}`); "
        "empty if the species KB is not built.",
        examples=[{"Zebra": "zebra"}],
    )


class ExplainResponse(BaseModel):
    model_config = ConfigDict(json_schema_extra={"description": "Class activation map for one class."})

    model: str = Field(..., examples=["efficientnetv2_s"])
    class_index: int = Field(..., description="Class the heatmap explains.", examples=[79])
    label: str = Field(..., examples=["Zebra"])
    probability: float = Field(..., examples=[0.97])
    predicted: Prediction = Field(..., description="Top-1 prediction (may differ from `class_index`).")
    predictions: List[Prediction] = Field(..., description="Top-5 predictions from the same forward pass.")
    low_confidence: bool
    low_confidence_threshold: float = Field(0.5, examples=[0.5])
    method: str = Field(..., examples=["CAM (== Grad-CAM for this GAP->Linear head), last conv block"])
    colormap: str = Field(..., examples=["jet"])
    width: int = Field(..., description="Width of both PNGs (uploaded image size, longest side capped).")
    height: int
    image: ImageInfo
    overlay_png: str = Field(..., description="Base64 PNG (RGB): colourised heatmap blended over the image.")
    heatmap_png: str = Field(..., description="Base64 PNG (8-bit grayscale): normalised heatmap, 255 = strongest.")
    grid: List[List[float]] = Field(..., description="Normalised [0,1] heatmap at feature-map resolution (e.g. 7x7).")
    inference_ms: float
    explain_ms: float = Field(..., description="CAM computation + upsampling + PNG encoding.")
    slugs: Dict[str, str] = Field(
        default_factory=dict,
        description="Species-atlas slug for each returned label (`GET /api/species/{slug}`); "
        "empty if the species KB is not built.",
        examples=[{"Zebra": "zebra"}],
    )


# ---------------------------------------------------------------- metrics / figures
class MetricsSummary(BaseModel):
    test_accuracy: Optional[float] = None
    test_top5_accuracy: Optional[float] = None
    best_val_accuracy: Optional[float] = None
    macro_precision: Optional[float] = None
    macro_recall: Optional[float] = None
    macro_f1: Optional[float] = None
    macro_roc_auc: Optional[float] = None
    macro_avg_class_accuracy: Optional[float] = None
    total_params: Optional[int] = None
    avg_inference_ms_per_image: Optional[float] = None
    best_epoch: Optional[int] = None
    epochs: Optional[int] = None
    batch_size: Optional[int] = None
    learning_rate: Optional[float] = None
    optimizer: Optional[str] = None
    test_samples: Optional[int] = None
    train_time_minutes: Optional[float] = None


class ModelMetrics(BaseModel):
    id: str
    display_name: str
    summary: MetricsSummary
    hparams: Optional[Dict[str, Any]] = None
    per_class_accuracy: Optional[Dict[str, float]] = Field(None, description="label -> test accuracy (recall).")
    per_class_prf: Optional[List[Dict[str, Any]]] = Field(
        None, description="Rows {class, precision, recall, f1_score, support} where available."
    )
    history: Optional[Dict[str, List[Any]]] = Field(
        None, description="Column-oriented per-epoch curves: epoch, train_loss, train_acc, val_loss, val_acc, ..."
    )
    figures: List[str] = Field(default_factory=list, description="Figure names for /api/figures/{name}.")
    sources: List[str] = Field(default_factory=list, description="Files in outputs/results this entry was built from.")
    raw: Dict[str, Any] = Field(default_factory=dict, description="Original JSON file contents (local paths stripped).")


class MetricsResponse(BaseModel):
    models: Dict[str, ModelMetrics]


class FigureInfo(BaseModel):
    name: str = Field(..., examples=["efficientnetv2_s_confusion_matrix.png"])
    url: str = Field(..., examples=["/api/figures/efficientnetv2_s_confusion_matrix.png"])
    model: Optional[str] = Field(None, description="Model id prefix, if the figure belongs to one model.")
    size_bytes: int


class FiguresResponse(BaseModel):
    figures: List[FigureInfo]


# ---------------------------------------------------------------- species knowledge base
class SpeciesImage(BaseModel):
    url: Optional[str] = None
    thumb_url: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    artist: Optional[str] = Field(None, description="Author/attribution, HTML stripped.")
    license: Optional[str] = Field(None, examples=["CC BY-SA 4.0"])
    license_url: Optional[str] = None
    source_url: Optional[str] = Field(None, description="File description page (Commons or iNaturalist).")
    provider: Optional[str] = Field(None, examples=["Wikimedia Commons"])
    file: Optional[str] = None


class IucnStatus(BaseModel):
    code: Optional[str] = Field(
        None, description="LC/NT/VU/EN/CR/EW/EX/DD/NE; null for groups, domestic forms, hybrids.", examples=["VU"]
    )
    label: str = Field(..., examples=["Vulnerable", "Not applicable (group)"])
    source: Optional[str] = Field(None, examples=["IUCN Red List via Wikidata (P141)"])
    source_url: Optional[str] = None


class ModelClassStats(BaseModel):
    model: str = Field(..., examples=["efficientnetv2_s"])
    test_accuracy: Optional[float] = Field(None, description="Per-class test accuracy (recall).", examples=[0.95])
    test_images: Optional[int] = Field(None, examples=[42])
    source: Optional[str] = None


class SpeciesSummary(BaseModel):
    slug: str = Field(..., examples=["red-panda"])
    label: str = Field(..., description="Class label used by the model.", examples=["Red panda"])
    common_name: str = Field(..., examples=["Red panda"])
    scientific_name: Optional[str] = Field(None, examples=["Ailurus fulgens"])
    is_group: bool = Field(..., description="True when the label is a group of species, not a single species.")
    animal_group: Optional[str] = Field(None, examples=["Mammal"])
    thumb_url: Optional[str] = None
    iucn_code: Optional[str] = Field(None, examples=["EN"])
    iucn_label: Optional[str] = Field(None, examples=["Endangered"])
    model_accuracy: Optional[float] = Field(None, description="Per-class test accuracy of the served model.", examples=[0.93])
    # Only with ?extended=true (omitted otherwise, so the default shape is unchanged).
    rank: Optional[str] = Field(None, description="Taxonomic rank (extended only).", examples=["species"])
    image: Optional[SpeciesImage] = Field(None, description="Image with attribution (extended only).")
    inaturalist_observations: Optional[int] = Field(None, description="iNaturalist observations (extended only).")
    test_images: Optional[int] = Field(None, description="Test-split images for this class (extended only).")


class SpeciesImageFiles(BaseModel):
    hero: Optional[str] = Field(None, description="URL of the ~1280 px local copy.")
    card: Optional[str] = Field(None, description="URL of the ~500 px local copy.")


class SpeciesImagesResponse(BaseModel):
    count: int = Field(..., description="Species with at least one cached image.")
    images: Dict[str, SpeciesImageFiles] = Field(..., description="Keyed by species slug.")


class SpeciesListResponse(BaseModel):
    count: int
    total: int = Field(..., description="Number of species in the KB (before filtering).")
    species: List[SpeciesSummary]


class SpeciesDetail(BaseModel):
    model_config = ConfigDict(extra="allow")

    label: str
    slug: str
    common_name: str
    scientific_name: Optional[str] = None
    rank: Optional[str] = None
    is_group: bool
    domestic: bool = False
    rank_note: Optional[str] = None
    taxonomy: Dict[str, Optional[str]] = Field(default_factory=dict)
    animal_group: Optional[str] = None
    summary: Optional[str] = None
    description: Optional[str] = None
    wikipedia_title: Optional[str] = None
    wikipedia_url: Optional[str] = None
    wikidata_id: Optional[str] = None
    image: Optional[SpeciesImage] = None
    iucn_status: IucnStatus
    gbif_taxon_key: Optional[int] = Field(None, description="For GBIF Maps API v2 occurrence tiles.")
    gbif_taxon: Optional[Dict[str, Any]] = None
    inaturalist_taxon_id: Optional[int] = None
    inaturalist_taxon: Optional[Dict[str, Any]] = None
    inaturalist_observations: Optional[int] = None
    model_stats: Optional[ModelClassStats] = None
    fetched_at: Optional[str] = None


# ---------------------------------------------------------------- chat
class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    # User messages are limited by WILDLENS_CHAT_MAX_MESSAGE_CHARS in the router; assistant
    # messages (earlier answers) are trimmed instead, so only the body-size limit applies here.
    content: str = Field(..., min_length=1, max_length=65536)


class ChatContext(BaseModel):
    species_slug: Optional[str] = Field(None, max_length=64, examples=["red-panda"])
    label: Optional[str] = Field(None, max_length=64, description="Class label from a prediction.", examples=["Red panda"])


class ChatRequest(BaseModel):
    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {"messages": [{"role": "user", "content": "Where do red pandas live?"}]},
                {"messages": [{"role": "user", "content": "Is it endangered?"}],
                 "context": {"species_slug": "polar-bear"}},
            ]
        }
    )

    messages: List[ChatMessage] = Field(..., min_length=1, max_length=100,
                                        description="Conversation so far; the last message must be from the user.")
    context: Optional[ChatContext] = None
