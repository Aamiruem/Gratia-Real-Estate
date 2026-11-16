# Gratia NCR price estimates

This module adapts the property-price workflow from the repository supplied by
the project owner. It uses the included `data/property_data.csv` and does not
copy the source project's authentication app, database, credentials, or saved
pickle. The model is trained and evaluated as part of the Render and Docker
backend build.

## Local training

From `backend/`, install `requirements.txt`, then run:

```powershell
python -m app.predictor.train_model
```

The command creates `model/price_model.joblib` and `model/metadata.json`.
Changing the CSV and deploying retrains the model. There is no upstream live
market-data provider in the supplied project, so this does not refresh market
prices automatically between dataset updates.

## Validation and limits

The included 996-row dataset has no source or collection date. A fixed random
80/20 split produced 200 held-out rows, MAE about INR 3.66 lakh, MAPE 7.14%,
R² 0.977, and a 90th percentile absolute percentage error of 13.81%. These are
offline results on the supplied dataset, not proof of live-market performance
or a guarantee for an individual property. The UI labels estimates as
indicative and shows the holdout error range. Do not describe the model as
100% accurate or as a certified appraisal.

The public API is mounted at `/predictions`: `GET /health`, `/options`,
`/metrics`, `/feature-importance`, and `POST /`.
