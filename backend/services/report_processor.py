import pandas as pd


class ReportProcessor:

    def process_reports(
        self,
        resdex_path,
        job_path
    ):

        resdex_df = pd.read_excel(resdex_path)
        job_df = pd.read_excel(job_path)

        merged = pd.merge(
            resdex_df,
            job_df,
            on="email"
        )

        return merged