use actix_web::{ResponseError, http::StatusCode};

#[derive(Debug, PartialEq)]
pub struct ErrorWithStatus {
    pub status: StatusCode,
}
impl std::fmt::Display for ErrorWithStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.status)
    }
}
impl std::error::Error for ErrorWithStatus {}

pub trait StatusCodeResultExt<T, E> {
    fn with_status(self, status: StatusCode) -> anyhow::Result<T>;
    fn with_status_from(self, get_status: impl FnOnce(&E) -> StatusCode) -> anyhow::Result<T>;
    fn with_response_status(self) -> anyhow::Result<T>
    where
        Self: Sized,
        E: ResponseError;
}

impl<T, E> StatusCodeResultExt<T, E> for Result<T, E>
where
    E: std::fmt::Display,
{
    fn with_status(self, status: StatusCode) -> anyhow::Result<T> {
        self.map_err(|err| anyhow::anyhow!(ErrorWithStatus { status }).context(err.to_string()))
    }

    fn with_status_from(self, get_status: impl FnOnce(&E) -> StatusCode) -> anyhow::Result<T> {
        self.map_err(|err| {
            let status = get_status(&err);
            anyhow::anyhow!(ErrorWithStatus { status }).context(err.to_string())
        })
    }

    fn with_response_status(self) -> anyhow::Result<T>
    where
        E: ResponseError,
    {
        self.with_status_from(ResponseError::status_code)
    }
}

pub trait ActixErrorStatusExt<T> {
    fn with_actix_error_status(self) -> anyhow::Result<T>;
}

impl<T> ActixErrorStatusExt<T> for Result<T, actix_web::Error> {
    fn with_actix_error_status(self) -> anyhow::Result<T> {
        // Snapshot the HTTP status before converting to anyhow, which does not preserve Actix's response mapping for later inspection.
        self.with_status_from(|e| e.as_response_error().status_code())
    }
}
