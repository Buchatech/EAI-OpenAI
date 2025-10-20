# AI Integration in ExpenseAI

This document explains how artificial intelligence is implemented within the ExpenseAI application for automatic expense categorization.

## Overview

ExpenseAI leverages OpenAI's advanced language models to automatically categorize expenses based on their descriptions. Using GPT models, the application provides highly accurate and context-aware expense categorization without requiring custom training.

![AI Categorization](https://via.placeholder.com/800x400?text=AI+Categorization+Flow)

## How It Works

### 1. User Interaction

Users can select one or more expenses in the application's interface and click the "Auto-Categorize" button. The application then:

- Collects the selected expense IDs
- Sends them to the backend for AI-powered categorization
- Updates the UI with the new categories once processing is complete

### 2. Backend Processing Pipeline

#### A. API Request Handling

When the "Auto-Categorize" button is clicked, the frontend makes a POST request to `/api/expenses/categorize` with the selected expense IDs.

```javascript
// From public/js/api.js
async categorizeExpenses(expenseIds) {
  try {
    const response = await fetch(`${API_BASE_URL}/expenses/categorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenseIds }),
    });
    
    return await response.json();
  } catch (error) {
    console.error('Error categorizing expenses:', error);
    throw error;
  }
}
```

#### B. Expense Processing

For each expense ID received, the server:

1. Retrieves the expense details from the database
2. Extracts the expense description
3. Sends the description to the AI categorization function
4. Updates the expense record with the predicted category

#### C. AI Prediction

The core AI functionality happens in the `predictCategory` function:

```javascript
// From src/controllers/expenseController.js
async function predictCategory(description, existingCategories) {
  // Uses the OpenAI API to predict the most appropriate category
  // for the given expense description
  
  // Different payload format based on model type (zero-shot vs. text generation)
  let payload = {
    inputs: description,
    parameters: {
      candidate_labels: existingCategories.join(',')
    }
  };
  
  // API request to OpenAI
  const response = await openai.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
    messages: [
      {
        role: "system",
        content: "You are a precise expense categorization assistant."
      },
      {
        role: "user",
        content: `Categorize this expense: "${description}"`
      }
    ],
    temperature: 0.3,
    max_tokens: 20
  });
  
  // The response contains scores for each category
  // The highest scoring category is selected
}
```

#### D. Fallback Mechanism

If the AI service is unavailable or fails, the application falls back to a rule-based keyword matching system:

```javascript
// From src/controllers/expenseController.js
function simpleKeywordCategorization(description, categories) {
  const text = description.toLowerCase();
  
  const keywordMap = {
    'food': ['grocery', 'restaurant', 'meal', 'lunch', 'dinner', 'breakfast'],
    'transportation': ['gas', 'fuel', 'bus', 'train', 'taxi', 'uber'],
    'housing': ['rent', 'mortgage', 'apartment', 'home', 'house'],
    'utilities': ['electric', 'water', 'internet', 'phone', 'bill'],
    'entertainment': ['movie', 'game', 'concert', 'show', 'netflix'],
    'healthcare': ['doctor', 'medical', 'medicine', 'dental', 'pharmacy'],
    'shopping': ['clothes', 'shoes', 'amazon', 'walmart', 'target'],
    'education': ['tuition', 'book', 'school', 'college', 'course']
  };
  
  // Match category based on keywords
  for (const [category, keywords] of Object.entries(keywordMap)) {
    if (categories.includes(category) && 
        keywords.some(keyword => text.includes(keyword))) {
      return category;
    }
  }
  
  // Default category if no match found
  return categories.includes('Miscellaneous') ? 'Miscellaneous' : categories[0];
}
```

### 3. AI Model Details

ExpenseAI uses OpenAI's GPT models, which provide state-of-the-art language understanding:

- **Architecture**: Advanced transformer-based large language model
- **Training**: The model is trained on vast amounts of data with general knowledge
- **Capabilities**: Deep understanding of context and semantics for accurate categorization
- **Input**: Natural language expense descriptions
- **Output**: Direct category prediction with contextual understanding

## Technical Implementation

### Environment Configuration

The AI functionality is configured through environment variables:

```env
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-3.5-turbo  # or gpt-4 for higher accuracy
```

### Request Format

The OpenAI API request is formatted using the chat completions endpoint:

```json
{
  "model": "gpt-3.5-turbo",
  "messages": [
    {
      "role": "system",
      "content": "You are a precise expense categorization assistant..."
    },
    {
      "role": "user",
      "content": "Categorize this expense: 'Dinner at Italian restaurant'..."
    }
  ],
  "temperature": 0.3
}
```

### Response Format

The OpenAI API returns a structured response with the predicted category:

```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1702222222,
  "model": "gpt-3.5-turbo-0613",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Food"
      },
      "finish_reason": "stop"
    }
  ]
}
```

## How GPT-Based Classification Works

The GPT models provide sophisticated natural language understanding capabilities:

1. The model has been trained on vast amounts of data to understand context and semantics
2. It processes the expense description and provided categories holistically
3. It uses its deep understanding of language and common expenses to make accurate categorizations
4. The system maintains high accuracy while being flexible enough to handle various expense descriptions
5. The temperature parameter controls the balance between consistency and creativity in categorization

## Benefits of the AI Approach

1. **Automation**: Reduces manual categorization effort
2. **Accuracy**: Often more accurate than keyword-based approaches
3. **Flexibility**: Can understand various phrasings of similar expenses
4. **Robustness**: Fallback mechanism ensures the system always works
5. **Scalability**: New categories can be added without retraining

## Future AI Enhancements

Potential improvements to the AI functionality include:

1. **Personalized Categorization**: Learning user preferences over time
2. **Receipt OCR Integration**: Automatically extracting expense details from photos
3. **Expense Anomaly Detection**: Flagging unusual spending patterns
4. **Predictive Analytics**: Forecasting future expenses based on historical data
5. **Multi-Language Support**: Processing expense descriptions in various languages

---

For technical implementation details, refer to the codebase, specifically:
- `src/controllers/expenseController.js`
- `public/js/api.js`
- `public/js/expenses.js`