# eLuna Helper

## Important information before you start

1. **How it works?** This extension does not interfere with the integrity of eLuna or any other systems of the United Nations. It simply retrieves the active segment and its associated term pairs displayed on your eLuna page, combines them with your preset prompt (if applicable), sends them to the selected translation service — which can be either a large language model (LLM) or a conventional machine translation (MT) system — and displays the returned translation on the page.
2. **Why use this extension?** 
- To some extent, it improves terminology accuracy, since both the active segment and its term pairs are supplied to the translation service, which can incorporate the provided terms into the translation.
- It enhances efficiency. You no longer need to copy and paste text into separate AI chatbots or online translation tools. It also replaces full-width parentheses with half-width ones and auto-format quotes in the translated text.
3. **It has limitations.** The quality of the translation depends on the selected service and several factors, such as the model or engine used, your prompt (for LLMs), and the source text itself. Therefore, a consistently accurate translation cannot be guaranteed. For LLM-based services, different combinations of these factors may produce different results, and there is no one-size-fits-all solution in terms of model selection or prompt design. One known limitation is that, because the segment and its term pairs are provided out of context, the translation engine may occasionally select an inappropriate term.
4. **Cost and usage.** Services (such as DeepSeek, OpenAI, or DeepL Pro) require paid API keys. Charges are typically based on usage, measured in tokens or characters, depending on the provider. Both input (including your prompt) and output are billed. For instance, DeepSeek charges ¥2 per million input tokens and ¥3 per million output tokens. As a rough estimate, a typical day’s translation workload may cost around ¥0.1 under DeepSeek’s pricing, though the actual amount will vary depending on usage. 

## Get your API keys

### DeepSeek
1. Visit [**DeepSeek开放平台**](https://platform.deepseek.com), create an account, and sign in
2. Click [**API Keys**](https://platform.deepseek.com/api_keys) on the left side of the page
3. Click `创建API Key`, enter any name for the API, and click `创建`
4. Copy and save the generated API key in a secure place
5. Click `充值` on the left side of the page, and make a small payment for your account

### DeepL
1. Log into DeepL [**API key page**](https://www.deepl.com/en/your-account/keys)
2. Click `Create key`
3. Copy and save the generated API key in a secure place

Alternatively refer to this [**DeepL support page**](https://support.deepl.com/hc/en-us/articles/360020695820-API-key-for-DeepL-API#h_01HM9MFQ195GTHM93RRY63M18W)

### OpenAI
1. Log into the OpenAI [**API key page**](https://platform.openai.com/api-keys)
2. Click `Create new secret key`
3. Copy and save the generated API key in a secure place

### Google Translate
Refer to [**this tutorial**](https://translatepress.com/docs/automatic-translation/generate-google-api-key/#createnewproject) for a Google Translate API key

## Install the extension
- For Chrome, visit [this page](https://chromewebstore.google.com/detail/djiaodlcdammfkknpekalbfegmaokcci?utm_source=item-share-cb)
- For Edge, visit [this page]().

## Open the script settings page
1. At the** top-right corner of the toolbar** (next to the address bar), you should see a small puzzle-piece icon
2. Click the puzzle-piece icon to open the list of installed extensions, and you should see the eLuna Helper extension<br>
   <img width="426" height="244" alt="image" src="https://github.com/user-attachments/assets/df41944d-2ceb-4488-a96c-10d70df83840" />
4. Click the extension, you should see a list of four inactive services<br>
   <img width="441" height="548" alt="image" src="https://github.com/user-attachments/assets/52dfbf87-e253-45a2-932d-b6e33379d00a" />
5. Click the the gear icon to configure the services. Once configured, the services will become active<br>
   <img width="444" height="511" alt="image" src="https://github.com/user-attachments/assets/5b7e6fdf-c810-4f98-baf7-77ae77ed2b89" />


## Configure the services
1. `API Key`: Enter the API key
2. `Model`: Choose the LLM model you want to use
3. `System Prompt`: Enter your customized prompt for translation.
   - Since we only need the translation from the LLM, it's better to use this rule: `请直接输出译文，不要做解释、分析或讨论。`
   - Since the script provides a list of term pairs when requesting translation, you should consider adding a constraint into your prompt, such as: `**严格使用用户提供的术语**，如果用户提供的术语对应多个译法，要结合句子从中选择最合适的译法。`
   - Rules related to numbers and punctuations will be helpful too, such as：`**符合标点和数字规范。** - 纯属计量或统计的数字一律用阿拉伯数字表示，数字分组以空格代替逗号，万以上用“万”“亿”等中文单位，百分数并列时“%”不省，例如：**123,456,023 → 123 456 023；fifty million → 5 000万；1-2 per cent → 1%-2 %；five percentage points → 5个百分点。**`
4. `Project Rules`: Here you can specify your rules for certain types of projects
   - For example, if you are translation a SR document, you may add such rules as: `句首人名不翻译；said翻译成“说”`
5. `Temperature`: You can tweak this figure to see if the result meets your expectation. The lower this figure is, the less random and creative the result will be. For translation, a figure between 1 to 1.3 will be a reasonable
   
## Use the extension in eLuna
1. On your eLuna page, select any segement you want to translate
2. Click `Show more`
3. In the UNTerm section, you should see buttons for configured services<br>
   <img width="646" height="274" alt="image" src="https://github.com/user-attachments/assets/1345f0a0-dd7b-4109-b789-c4a606a24fc2" />
4. Click any one of them, and a translation from the LLM will be added to the translation box

## Possible todo's
1. Provide context by sending the current segment plus several preceding and following segments to the LLM, if this helps improve translation quality
2. Support more services
