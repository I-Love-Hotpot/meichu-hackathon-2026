class InputImageError(Exception):
    """The supplied image cannot be read."""


class ModelLoadError(Exception):
    """A required inference model is missing or incompatible."""


class DatabaseLoadError(Exception):
    """The pill database is missing or invalid."""


class InferenceError(Exception):
    """An unexpected inference-stage error occurred."""