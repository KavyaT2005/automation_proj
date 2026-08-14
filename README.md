# Intelligent Verification Studio (RPA Bot)

An AI-powered Robotic Process Automation (RPA) tool built to intelligently extract data from unstructured documents (Images, PDFs, Excel) and automatically inject it into target web applications (like ERP systems) using semantic field mapping.

## 🚀 Features

- **Dynamic Form Crawler**: Uses Playwright and custom DOM resolvers to crawl any target URL, bypass login walls (with session cookie caching), and extract floating labels and required fields dynamically.
- **Multi-Format Ingestion**: Supports uploading Single Images, Batch Images (concurrent processing), PDFs, and Excel/CSV files.
- **AI-Powered OCR & Extraction**: Uses PaddleOCR for text extraction and a local Small Language Model (SLM via Ollama/Phi-3) to intelligently parse unstructured text into structured JSON data.
- **Semantic Field Mapping**: Employs HuggingFace `Sentence-Transformers` to calculate Cosine Similarity between extracted document keys and the target website's schema, allowing for fuzzy matching (e.g., mapping "Postal Code" to "Pincode").
- **Verification Dashboard**: A React-based UI that allows users to review extracted data, highlights missing required fields in red, and supports iterating through batch uploads before final submission.
- **Headless Automation**: Once data is verified, Playwright automatically navigates to the target site and types the data into the correct fields flawlessly.

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy (SQLite)
- **Frontend**: React.js, TailwindCSS, Vite
- **Automation Engine**: Playwright (Chromium)
- **AI / ML**: Ollama (Phi-3/Llama-3), Sentence-Transformers, PaddleOCR, Pandas

## ⚙️ Local Setup & Installation

### Prerequisites
- Python 3.10+
- Node.js 18+
- [Ollama](https://ollama.ai/) installed locally with your preferred SLM (e.g., `ollama run phi3`).

### 1. Backend Setup
```bash
# Clone the repository
git clone https://github.com/KavyaT2005/automation_proj.git
cd automation_proj/backend

# Create virtual environment and install dependencies
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Start the FastAPI server
uvicorn app.main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd ../frontend

# Install dependencies
npm install

# Start the React development server
npm run dev
```

## 🧠 How It Works (Current Flow)
1. **Target Setup**: User inputs the target web application URL.
2. **Crawl**: Backend Playwright bot crawls the URL, logs in, and extracts the form schema.
3. **Upload**: User uploads documents (e.g., Batch Images).
4. **Extraction**: Ollama & PaddleOCR extract the text.
5. **Mapping**: Sentence-Transformers map the extracted keys to the target schema.
6. **Verification**: User verifies the data in the React Dashboard. Missing fields are highlighted.
7. **Automate**: Playwright takes the verified data and automates the data entry on the target website.

## 🔮 Roadmap
- Migration from SQLite to PostgreSQL.
- Multi-Module Orchestration (Processing a single Master Excel workbook with multiple sheets routing to different application modules sequentially).

---
*Developed for intelligent, human-in-the-loop RPA automation.*
